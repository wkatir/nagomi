import { z } from "zod";

// https://docs.wompi.sv. The API Secret also signs webhooks (wompi_hash: HMAC-SHA256 of the
// raw body, lower-case hex).
export const WOMPI_TOKEN_URL = "https://id.wompi.sv/connect/token";
export const WOMPI_API_URL = "https://api.wompi.sv";

export type WompiCredentials = { clientId: string; clientSecret: string };

export type WompiEnv = {
	WOMPI_CLIENT_ID?: string;
	WOMPI_CLIENT_SECRET?: string;
};

export function wompiCredentials(env: WompiEnv): WompiCredentials | null {
	if (Boolean(env.WOMPI_CLIENT_ID) !== Boolean(env.WOMPI_CLIENT_SECRET))
		throw new Error(
			"WOMPI_CLIENT_ID and WOMPI_CLIENT_SECRET must be set together",
		);
	if (!env.WOMPI_CLIENT_ID || !env.WOMPI_CLIENT_SECRET) return null;
	return {
		clientId: env.WOMPI_CLIENT_ID,
		clientSecret: env.WOMPI_CLIENT_SECRET,
	};
}

export class WompiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

const tokenResponse = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().int().positive(),
});

const linkResponse = z.object({
	idEnlace: z.number().int(),
	urlEnlace: z.url(),
	estaProductivo: z.boolean(),
});

export type PaymentLinkInput = {
	// identificadorEnlaceComercio: the webhook names the order with it.
	reference: string;
	// Minor units; Wompi takes dollars.
	amount: number;
	productName: string;
	redirectUrl: string;
	webhookUrl: string;
};

const dollars = (cents: number) => {
	if (!Number.isSafeInteger(cents) || cents < 1)
		throw new Error(`Invalid amount ${cents}`);
	return cents / 100;
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function wompiClient(
	credentials: WompiCredentials,
	fetcher: Fetch = fetch,
	clock: () => number = Date.now,
) {
	let token: { value: string; expiresAt: number } | null = null;

	async function accessToken() {
		if (token && token.expiresAt > clock()) return token.value;
		const res = await fetcher(WOMPI_TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				audience: "wompi_api",
				client_id: credentials.clientId,
				client_secret: credentials.clientSecret,
			}).toString(),
		});
		if (!res.ok)
			throw new WompiError(
				`Wompi token request failed (${res.status})`,
				res.status,
			);
		const body = tokenResponse.parse(await res.json());
		token = {
			value: body.access_token,
			expiresAt: clock() + (body.expires_in - 60) * 1000,
		};
		return token.value;
	}

	return {
		async createPaymentLink(input: PaymentLinkInput) {
			const res = await fetcher(`${WOMPI_API_URL}/EnlacePago`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${await accessToken()}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					identificadorEnlaceComercio: input.reference,
					monto: dollars(input.amount),
					nombreProducto: input.productName,
					formaPago: {
						permitirTarjetaCreditoDebido: true,
						permitirPagoConPuntoAgricola: false,
						permitirPagoEnCuotasAgricola: false,
						permitirPagoEnBitcoin: false,
						permitePagoQuickPay: false,
					},
					configuracion: {
						urlRedirect: input.redirectUrl,
						urlRetorno: input.redirectUrl,
						urlWebhook: input.webhookUrl,
						esMontoEditable: false,
						esCantidadEditable: false,
						cantidadPorDefecto: 1,
						notificarTransaccionCliente: true,
					},
					limitesDeUso: { cantidadMaximaPagosExitosos: 1 },
				}),
			});
			if (!res.ok)
				throw new WompiError(
					`Wompi payment link request failed (${res.status})`,
					res.status,
				);
			const body = linkResponse.parse(await res.json());
			return {
				linkId: String(body.idEnlace),
				url: body.urlEnlace,
				production: body.estaProductivo,
			};
		},
	};
}

export type WompiClient = ReturnType<typeof wompiClient>;

const toHex = (buffer: ArrayBuffer) =>
	[...new Uint8Array(buffer)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

export async function hmacSha256Hex(secret: string, message: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return toHex(
		await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
	);
}

function sameText(a: string, b: string) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function validWebhookSignature(
	secret: string,
	rawBody: string,
	signature: string | undefined,
) {
	if (!signature) return false;
	const expected = await hmacSha256Hex(secret, rawBody);
	return sameText(expected, signature.trim().toLowerCase());
}

const webhookBody = z.looseObject({
	IdTransaccion: z.string().min(1),
	ResultadoTransaccion: z.string(),
	Monto: z.number().nonnegative(),
	EsProductiva: z.boolean().optional(),
	EnlacePago: z.looseObject({
		Id: z.union([z.number(), z.string()]).optional(),
		IdentificadorEnlaceComercio: z.string().min(1),
	}),
});

export type WompiWebhook = {
	transactionId: string;
	approved: boolean;
	amount: number;
	reference: string;
	production: boolean | null;
};

export function parseWebhook(json: unknown): WompiWebhook | null {
	const parsed = webhookBody.safeParse(json);
	if (!parsed.success) return null;
	const b = parsed.data;
	return {
		transactionId: b.IdTransaccion,
		approved: b.ResultadoTransaccion === "ExitosaAprobada",
		amount: Math.round(b.Monto * 100),
		reference: b.EnlacePago.IdentificadorEnlaceComercio,
		production: b.EsProductiva ?? null,
	};
}
