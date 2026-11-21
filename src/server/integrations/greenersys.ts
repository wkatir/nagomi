// GreenerSys e-invoicing API, contract v1 (https://<tenant>.thegreenersys.com/docs). Each
// environment has its own URL and key: a test key must never reach production.
import { env } from "cloudflare:workers";
import type { InvoiceRequest } from "../domain/invoicing";

export type ProviderDocument = {
	id: string;
	tipoDte: string;
	estado: string;
	numeroControl: string;
	codigoGeneracion: string;
	sello: string | null;
	fechaEmision: string;
	totalPagar: number;
	totales: { gravada: number; iva: number; totalPagar: number };
	motivoRechazo?: {
		problema: string;
		accion: string;
		donde: string;
		original: string[];
	}[];
};

export type VoidRequest = {
	tipoAnulacion: 2;
	motivo: string;
	responsable: {
		nombre: string;
		tipoDocumento: "13" | "36";
		numeroDocumento: string;
	};
};

// A refusal of the request itself (400, 404, 422): retrying the same body cannot succeed.
export class ProviderRefused extends Error {
	constructor(
		readonly status: number,
		readonly providerMessage: string,
	) {
		super(`GreenerSys refused the request (${status}): ${providerMessage}`);
	}
}

// Everything else that stopped a call (credential, rate limit, a 409 for a key still in
// flight, 5xx, network): the same request can be sent again later.
export class ProviderUnavailable extends Error {}

export const invoicingConfigured = () =>
	Boolean(env.GREENERSYS_API_URL) && Boolean(env.GREENERSYS_API_KEY);

const RETRIES = 2;
// The longest Retry-After waited inside one request; a longer one is left to the cron.
const MAX_WAIT_MS = 5_000;
const TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function message(res: Response) {
	const text = await res.text();
	try {
		const body = JSON.parse(text) as { message?: unknown };
		return typeof body.message === "string" ? body.message : text;
	} catch {
		return text;
	}
}

async function call(
	path: string,
	init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<Response> {
	if (!invoicingConfigured())
		throw new ProviderUnavailable(
			"GREENERSYS_API_URL or GREENERSYS_API_KEY is empty",
		);
	const url = `${env.GREENERSYS_API_URL.replace(/\/+$/, "")}/api/v1${path}`;
	const headers: Record<string, string> = {
		"X-API-Key": env.GREENERSYS_API_KEY,
	};
	if (init.body !== undefined) headers["Content-Type"] = "application/json";
	if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
	for (let attempt = 0; ; attempt++) {
		let res: Response;
		try {
			res = await fetch(url, {
				method: init.method ?? "GET",
				headers,
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch (e) {
			if (attempt < RETRIES) {
				await sleep(500 * 2 ** attempt);
				continue;
			}
			throw new ProviderUnavailable(`${path}: ${(e as Error).message}`);
		}
		if (res.ok) return res;
		if (res.status === 400 || res.status === 404 || res.status === 422)
			throw new ProviderRefused(res.status, await message(res));
		const wait =
			res.status === 429
				? Number(res.headers.get("Retry-After") ?? "60") * 1000
				: 500 * 2 ** attempt;
		const retryable = res.status === 429 || res.status >= 500;
		if (retryable && attempt < RETRIES && wait <= MAX_WAIT_MS) {
			await sleep(wait);
			continue;
		}
		throw new ProviderUnavailable(
			`${path}: ${res.status} ${await message(res)}`,
		);
	}
}

export const greenersys = {
	emit: async (body: InvoiceRequest, idempotencyKey: string) =>
		(await (
			await call("/dte", { method: "POST", body, idempotencyKey })
		).json()) as ProviderDocument,
	get: async (id: string) =>
		(await (await call(`/dte/${id}`)).json()) as ProviderDocument,
	file: async (id: string, kind: "json" | "pdf") =>
		(await call(`/dte/${id}/${kind}`)).arrayBuffer(),
	void: async (id: string, body: VoidRequest) =>
		(await (
			await call(`/dte/${id}/anular`, { method: "POST", body })
		).json()) as ProviderDocument,
	dteTypes: async () =>
		(
			(await (await call("/catalogos/tipos-dte")).json()) as {
				items: { codigo: string; nombre: string; habilitado: boolean }[];
			}
		).items,
};
