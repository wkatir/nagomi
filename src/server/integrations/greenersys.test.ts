import { beforeEach, describe, expect, mock, test } from "bun:test";

const env = {
	GREENERSYS_API_URL: "https://tenant.example/",
	GREENERSYS_API_KEY: "k",
};
mock.module("cloudflare:workers", () => ({ env }));
const { greenersys, ProviderRefused, ProviderUnavailable } = await import(
	"./greenersys"
);

let responses: (() => Response)[];
let urls: string[];
globalThis.fetch = (async (input: RequestInfo | URL) => {
	urls.push(String(input));
	const next = responses.shift();
	if (!next) throw new Error("No response left");
	return next();
}) as typeof fetch;

const ok = () =>
	Response.json({
		items: [{ codigo: "01", nombre: "Factura", habilitado: true }],
	});
const status =
	(
		code: number,
		headers: Record<string, string> = {},
		body = '{"message":"m"}',
	) =>
	() =>
		new Response(body, { status: code, headers });

beforeEach(() => {
	responses = [];
	urls = [];
	env.GREENERSYS_API_URL = "https://tenant.example/";
});

describe("greenersys client", () => {
	test("joins the tenant base without a doubled slash", async () => {
		responses = [ok];
		expect(await greenersys.dteTypes()).toEqual([
			{ codigo: "01", nombre: "Factura", habilitado: true },
		]);
		expect(urls).toEqual(["https://tenant.example/api/v1/catalogos/tipos-dte"]);
	});

	test("waits a short Retry-After and tries again", async () => {
		responses = [status(429, { "Retry-After": "1" }), ok];
		await greenersys.dteTypes();
		expect(urls).toHaveLength(2);
	});

	test("leaves a long Retry-After to the cron", async () => {
		responses = [status(429, { "Retry-After": "60" })];
		await expect(greenersys.dteTypes()).rejects.toBeInstanceOf(
			ProviderUnavailable,
		);
		expect(urls).toHaveLength(1);
	});

	test("retries a server error twice, then gives up", async () => {
		responses = [status(502), status(502), status(502)];
		await expect(greenersys.dteTypes()).rejects.toThrow(
			"/catalogos/tipos-dte: 502 m",
		);
		expect(urls).toHaveLength(3);
	});

	test("does not retry a refused request and keeps the provider's words", async () => {
		responses = [status(404, {}, '{"message":"El documento no existe"}')];
		const error = await greenersys.get("x").catch((e) => e);
		expect(error).toBeInstanceOf(ProviderRefused);
		expect(error.providerMessage).toBe("El documento no existe");
		expect(urls).toHaveLength(1);
	});

	test("does not retry a credential problem", async () => {
		responses = [status(401, {}, "Unauthorized")];
		await expect(greenersys.dteTypes()).rejects.toThrow("401 Unauthorized");
		expect(urls).toHaveLength(1);
	});

	test("refuses to call without a configured tenant", async () => {
		env.GREENERSYS_API_URL = "";
		await expect(greenersys.dteTypes()).rejects.toBeInstanceOf(
			ProviderUnavailable,
		);
		expect(urls).toEqual([]);
	});
});
