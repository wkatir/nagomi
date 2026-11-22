import { describe, expect, test } from "bun:test";
import {
	hmacSha256Hex,
	parseWebhook,
	validWebhookSignature,
	WOMPI_API_URL,
	WOMPI_TOKEN_URL,
	WompiError,
	wompiClient,
	wompiCredentials,
} from "./wompi";

const credentials = { clientId: "app-id", clientSecret: "api-secret" };

type Call = { url: string; init?: RequestInit };

function mockFetch(responses: Response[]) {
	const calls: Call[] = [];
	const fetcher = async (url: string, init?: RequestInit) => {
		calls.push({ url, init });
		const next = responses.shift();
		if (!next) throw new Error(`Unexpected request to ${url}`);
		return next;
	};
	return { calls, fetcher };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const link = {
	reference: "NAG-ABC123",
	amount: 8999,
	productName: "Pedido NAG-ABC123",
	redirectUrl: "https://nagomi.example/pedido/NAG-ABC123?pago=tarjeta",
	webhookUrl: "https://nagomi.example/api/payments/wompi/webhook",
};

describe("wompiCredentials", () => {
	test("is off without both keys and refuses only one of them", () => {
		expect(wompiCredentials({})).toBeNull();
		expect(
			wompiCredentials({ WOMPI_CLIENT_ID: "a", WOMPI_CLIENT_SECRET: "b" }),
		).toEqual({ clientId: "a", clientSecret: "b" });
		expect(() => wompiCredentials({ WOMPI_CLIENT_ID: "a" })).toThrow();
	});
});

describe("wompiClient", () => {
	test("gets a client-credentials token, then creates a payment link for the total in dollars", async () => {
		const { calls, fetcher } = mockFetch([
			json({ access_token: "tok", expires_in: 3600, token_type: "Bearer" }),
			json({
				idEnlace: 15,
				urlQrCodeEnlace: "https://x/qr.jpg",
				urlEnlace: "https://lk.wompi.sv/yhDt",
				estaProductivo: false,
			}),
		]);
		const created = await wompiClient(credentials, fetcher).createPaymentLink(
			link,
		);
		expect(created).toEqual({
			linkId: "15",
			url: "https://lk.wompi.sv/yhDt",
			production: false,
		});
		expect(calls[0].url).toBe(WOMPI_TOKEN_URL);
		expect(
			Object.fromEntries(new URLSearchParams(String(calls[0].init?.body))),
		).toEqual({
			grant_type: "client_credentials",
			audience: "wompi_api",
			client_id: "app-id",
			client_secret: "api-secret",
		});
		expect(calls[1].url).toBe(`${WOMPI_API_URL}/EnlacePago`);
		expect(
			(calls[1].init?.headers as Record<string, string>).authorization,
		).toBe("Bearer tok");
		const body = JSON.parse(String(calls[1].init?.body));
		expect(body.identificadorEnlaceComercio).toBe("NAG-ABC123");
		expect(body.monto).toBe(89.99);
		expect(body.configuracion.urlRedirect).toBe(link.redirectUrl);
		expect(body.configuracion.urlWebhook).toBe(link.webhookUrl);
		expect(body.configuracion.esMontoEditable).toBe(false);
		expect(body.formaPago.permitirTarjetaCreditoDebido).toBe(true);
	});

	test("reuses the token until it is about to expire", async () => {
		let now = 0;
		const { calls, fetcher } = mockFetch([
			json({ access_token: "a", expires_in: 3600 }),
			json({
				idEnlace: 1,
				urlEnlace: "https://lk.wompi.sv/a",
				estaProductivo: true,
			}),
			json({
				idEnlace: 2,
				urlEnlace: "https://lk.wompi.sv/b",
				estaProductivo: true,
			}),
			json({ access_token: "b", expires_in: 3600 }),
			json({
				idEnlace: 3,
				urlEnlace: "https://lk.wompi.sv/c",
				estaProductivo: true,
			}),
		]);
		const client = wompiClient(credentials, fetcher, () => now);
		await client.createPaymentLink(link);
		await client.createPaymentLink(link);
		now = 3600 * 1000;
		await client.createPaymentLink(link);
		expect(calls.map((c) => c.url.endsWith("/connect/token"))).toEqual([
			true,
			false,
			false,
			true,
			false,
		]);
	});

	test("a refused request is an error, not a link", async () => {
		const { fetcher } = mockFetch([json({ error: "invalid_client" }, 400)]);
		await expect(
			wompiClient(credentials, fetcher).createPaymentLink(link),
		).rejects.toBeInstanceOf(WompiError);
	});
});

describe("webhook", () => {
	const body = JSON.stringify({
		IdCuenta: "980b36e6",
		FechaTransaccion: "2026-11-21T10:00:00-06:00",
		Monto: 89.99,
		ModuloUtilizado: "EnlacePago",
		FormaPagoUtilizada: "PagoNormal",
		IdTransaccion: "2bedafea-1111-2222-3333-444455556666",
		ResultadoTransaccion: "ExitosaAprobada",
		EsProductiva: false,
		EnlacePago: {
			Id: 15,
			IdentificadorEnlaceComercio: "NAG-ABC123",
			NombreProducto: "Pedido",
		},
		cliente: { Nombre: "Ana", Email: "ana@example.com" },
	});

	test("accepts the HMAC-SHA256 of the raw body with the API secret, in any case", async () => {
		const signature = await hmacSha256Hex("api-secret", body);
		expect(signature).toMatch(/^[0-9a-f]{64}$/);
		expect(await validWebhookSignature("api-secret", body, signature)).toBe(
			true,
		);
		expect(
			await validWebhookSignature("api-secret", body, signature.toUpperCase()),
		).toBe(true);
	});

	test("refuses another secret, a changed body or a missing header", async () => {
		const signature = await hmacSha256Hex("api-secret", body);
		expect(await validWebhookSignature("other", body, signature)).toBe(false);
		expect(
			await validWebhookSignature("api-secret", `${body} `, signature),
		).toBe(false);
		expect(await validWebhookSignature("api-secret", body, undefined)).toBe(
			false,
		);
	});

	test("reads the transaction, its result, the amount in cents and our order code", () => {
		expect(parseWebhook(JSON.parse(body))).toEqual({
			transactionId: "2bedafea-1111-2222-3333-444455556666",
			approved: true,
			amount: 8999,
			reference: "NAG-ABC123",
			production: false,
		});
		expect(
			parseWebhook({
				...JSON.parse(body),
				ResultadoTransaccion: "ExitosaDeclinada",
			})?.approved,
		).toBe(false);
		expect(parseWebhook({ Monto: 1 })).toBeNull();
	});
});
