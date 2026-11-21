import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const files = new Map<string, ArrayBuffer>();
const env: Record<string, unknown> = {
	GREENERSYS_API_URL: "https://tenant.example",
	GREENERSYS_API_KEY: "test-key",
	DOCUMENTS: {
		put: async (key: string, value: ArrayBuffer) => {
			files.set(key, value);
		},
		get: async (key: string) => {
			const value = files.get(key);
			return value ? { body: new Blob([value]).stream() } : null;
		},
	},
};
mock.module("cloudflare:workers", () => ({ env }));
const { ordersRouter } = await import("./routes/admin/orders");
const { invoicesRouter } = await import("./routes/admin/invoices");
const { runInvoicing } = await import("./invoicing");
const { invoiceFile } = await import("./invoice-files");
const { getDb } = await import("#/db");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/orders", ordersRouter)
	.route("/invoices", invoicesRouter);

const send = (method: string, path: string, body?: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

type Call = { method: string; url: string; headers: Headers; body: unknown };
let calls: Call[];
let provider: (call: Call) => Response;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const call = {
		method: init?.method ?? "GET",
		url: String(input),
		headers: new Headers(init?.headers),
		body: init?.body ? JSON.parse(String(init.body)) : undefined,
	};
	calls.push(call);
	return provider(call);
}) as typeof fetch;

const answer = (over: Record<string, unknown> = {}) =>
	Response.json({
		id: "6f1c2a7e-0000-4000-8000-000000000001",
		tipoDte: "01",
		estado: "PROCESANDO",
		numeroControl: "DTE-01-M001P001-000000000000001",
		codigoGeneracion: "A1B2C3D4-0000-4000-8000-000000000001",
		sello: null,
		fechaEmision: "2026-11-01",
		totalPagar: 30,
		totales: { gravada: 30, iva: 3.45, totalPagar: 30 },
		...over,
	});
const sealed = (over: Record<string, unknown> = {}) =>
	answer({ estado: "SELLADO", sello: "2026SELLO0001", ...over });

let db: Database;
const docs = () =>
	db
		.query(
			"select id, order_id, status, idempotency_key, request, provider_id, seal, total, error, json_key, pdf_key, void_reason, void_responsible, public_token from tax_documents order by id",
		)
		.all() as {
		id: number;
		order_id: number;
		status: string;
		idempotency_key: string;
		request: string;
		provider_id: string | null;
		seal: string | null;
		total: number | null;
		error: string | null;
		json_key: string | null;
		pdf_key: string | null;
		void_reason: string | null;
		void_responsible: string | null;
		public_token: string;
	}[];

const code = (id: number) =>
	(db.query("select code from orders where id = ?").get(id) as { code: string })
		.code;

// An order of 2 x 15.00, confirmed for pickup and paid in cash or not.
async function confirmedOrder(options: { paid: boolean; channel?: string }) {
	const created = await send("POST", "/orders", {
		idempotencyKey: crypto.randomUUID(),
		channel: options.channel ?? "whatsapp",
		items: [{ variantId: 1, quantity: 2 }],
	});
	const { id } = (await created.json()) as { id: number };
	const confirmed = await send("POST", `/orders/${id}/confirm`, {
		paymentMethod: "cash",
		paid: options.paid,
		shippingMethod: "pickup",
		deliveryFrom: "2099-01-01",
		deliveryTo: "2099-01-01",
	});
	expect(confirmed.status).toBe(200);
	return id;
}

beforeEach(() => {
	calls = [];
	files.clear();
	provider = () => answer();
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 180);
insert into store_payment_methods (method) values ('cash');
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, routine_step) values ('cleanser', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Limpiador');
insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL', 1500, 'oil');
update products set status = 'published' where id = 1;
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 10, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 10, 0);
insert into lots (variant_id, receipt_line_id, expires_on, unit_cost_e4) values (1, 1, '2099-12-31', 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 10, 'u');
`);
	env.DB = d1(db);
	env.GREENERSYS_API_URL = "https://tenant.example";
});

describe("invoicing a sale", () => {
	test("recording the payment writes the Factura with it and sends it", async () => {
		const id = await confirmedOrder({ paid: false });
		expect(calls).toEqual([]);
		expect((await send("POST", `/orders/${id}/mark-paid`)).status).toBe(200);

		expect(calls).toHaveLength(1);
		const [call] = calls;
		expect(call.method).toBe("POST");
		expect(call.url).toBe("https://tenant.example/api/v1/dte");
		expect(call.headers.get("X-API-Key")).toBe("test-key");
		expect(call.headers.get("Idempotency-Key")).toBe(`${code(id)}-01-1`);
		expect(call.body).toEqual({
			tipoDte: "01",
			items: [
				{
					codigo: "OIL",
					descripcion: "Brand Aceite",
					cantidad: 2,
					precioUnitario: 13.2743,
					tipoVenta: "gravada",
				},
			],
			condicionOperacion: 1,
			pagos: [{ codigo: "01", monto: 30 }],
		});
		const [doc] = docs();
		expect(doc).toMatchObject({
			order_id: id,
			status: "processing",
			provider_id: "6f1c2a7e-0000-4000-8000-000000000001",
			total: 3000,
			error: null,
		});
	});

	test("a counter sale paid at confirmation waits for the seal", async () => {
		provider = () => sealed();
		await confirmedOrder({ paid: true, channel: "in_person" });
		expect((calls[0].body as { esperarSello: number }).esperarSello).toBe(8);
		expect(docs()[0]).toMatchObject({
			status: "sealed",
			seal: "2026SELLO0001",
		});
	});

	test("delivery invoices an order paid on delivery, and a later payment does not invoice it again", async () => {
		const id = await confirmedOrder({ paid: false });
		expect((await send("POST", `/orders/${id}/fulfill`)).status).toBe(200);
		expect(calls).toEqual([]);
		expect((await send("POST", `/orders/${id}/deliver`)).status).toBe(200);
		expect(docs()).toHaveLength(1);
		expect((await send("POST", `/orders/${id}/mark-paid`)).status).toBe(200);
		expect(docs()).toHaveLength(1);
		expect(calls).toHaveLength(1);
	});

	test("a refused body marks the Factura failed and lets a new one be issued", async () => {
		provider = () =>
			Response.json(
				{ message: "Los pagos suman $30.00 y el documento es de $30.01" },
				{ status: 400 },
			);
		const id = await confirmedOrder({ paid: true });
		expect(docs()[0]).toMatchObject({
			status: "failed",
			error: "Los pagos suman $30.00 y el documento es de $30.01",
		});
		provider = () => answer();
		expect((await send("POST", `/invoices/orders/${id}`, {})).status).toBe(201);
		expect(docs().map((d) => [d.status, d.idempotency_key])).toEqual([
			["failed", `${code(id)}-01-1`],
			["processing", `${code(id)}-01-2`],
		]);
	});

	test("a credential problem leaves the Factura queued, and the cron sends the same body", async () => {
		provider = () =>
			Response.json({ message: "Credencial inválida" }, { status: 401 });
		await confirmedOrder({ paid: true });
		const [queued] = docs();
		expect(queued).toMatchObject({ status: "queued" });
		expect(queued.error).toContain("401 Credencial inválida");

		provider = () => answer();
		await runInvoicing(getDb());
		expect(calls.at(-1)?.body).toEqual(JSON.parse(queued.request));
		expect(calls.at(-1)?.headers.get("Idempotency-Key")).toBe(
			queued.idempotency_key,
		);
		expect(docs()[0]).toMatchObject({ status: "processing", error: null });
	});

	test("the cron follows the seal, then files the signed JSON and the PDF by month", async () => {
		await confirmedOrder({ paid: true });
		provider = (call) =>
			call.url.endsWith("/json")
				? new Response('{"signed":true}')
				: call.url.endsWith("/pdf")
					? new Response("%PDF-1.7")
					: sealed();
		await runInvoicing(getDb());
		expect(docs()[0]).toMatchObject({ status: "sealed", json_key: null });
		await runInvoicing(getDb());
		const base = "dte/2026-11/A1B2C3D4-0000-4000-8000-000000000001";
		expect(docs()[0]).toMatchObject({
			json_key: `${base}.json`,
			pdf_key: `${base}.pdf`,
		});
		expect(new TextDecoder().decode(files.get(`${base}.pdf`))).toBe("%PDF-1.7");
	});

	test("a total that differs from the order's is flagged", async () => {
		provider = () => answer({ totalPagar: 30.01 });
		await confirmedOrder({ paid: true });
		expect(docs()[0].error).toBe(
			"total_mismatch: expected 3000, provider 3001",
		);
	});

	test("nothing is queued while invoicing is not configured", async () => {
		env.GREENERSYS_API_URL = "";
		await confirmedOrder({ paid: true });
		expect(docs()).toEqual([]);
		expect(calls).toEqual([]);
	});
});

describe("voiding and the buyer's copy", () => {
	const voidBody = {
		reason: "El cliente canceló antes de la entrega",
		responsible: {
			name: "Ana Ramírez",
			documentType: "13",
			documentNumber: "01234567-8",
		},
	};

	test("a sealed Factura is voided within its 3 months", async () => {
		provider = () => sealed();
		await confirmedOrder({ paid: true });
		provider = () => sealed({ estado: "ANULADO" });
		const res = await send("POST", "/invoices/1/void", voidBody);
		expect(res.status).toBe(200);
		expect(calls.at(-1)).toMatchObject({
			method: "POST",
			url: "https://tenant.example/api/v1/dte/6f1c2a7e-0000-4000-8000-000000000001/anular",
			body: {
				tipoAnulacion: 2,
				motivo: voidBody.reason,
				responsable: {
					nombre: "Ana Ramírez",
					tipoDocumento: "13",
					numeroDocumento: "01234567-8",
				},
			},
		});
		expect(docs()[0]).toMatchObject({
			status: "voided",
			void_reason: voidBody.reason,
			void_responsible: "Ana Ramírez",
		});
	});

	test("after 3 months, or before the seal, it cannot be voided", async () => {
		provider = () => sealed({ fechaEmision: "2020-01-01" });
		await confirmedOrder({ paid: true });
		const late = await send("POST", "/invoices/1/void", voidBody);
		expect(late.status).toBe(409);
		expect((await late.json()) as unknown).toEqual({
			error: "invoice_deadline_passed",
		});

		provider = () =>
			answer({
				id: "6f1c2a7e-0000-4000-8000-000000000002",
				codigoGeneracion: "B1",
			});
		await confirmedOrder({ paid: true });
		const early = await send("POST", "/invoices/2/void", voidBody);
		expect((await early.json()) as unknown).toEqual({
			error: "invoice_not_sealed",
		});
	});

	test("the buyer's link serves the PDF of a sealed Factura only", async () => {
		provider = (call) =>
			call.url.endsWith("/json")
				? new Response("{}")
				: call.url.endsWith("/pdf")
					? new Response("%PDF-1.7")
					: sealed();
		await confirmedOrder({ paid: true });
		const token = docs()[0].public_token;
		const res = await invoiceFile(
			new Request(`https://eclalune.com/f/${token}`),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/pdf");
		expect(await res.text()).toBe("%PDF-1.7");
		expect(
			(
				await invoiceFile(
					new Request(`https://eclalune.com/f/${crypto.randomUUID()}`),
				)
			).status,
		).toBe(404);
		expect(
			(await invoiceFile(new Request("https://eclalune.com/f/not-a-token")))
				.status,
		).toBe(404);
	});
});

describe("tax document rules in the database", () => {
	beforeEach(async () => {
		provider = () => sealed();
		await confirmedOrder({ paid: true });
	});
	const refused = (sql: string) => {
		try {
			db.exec(sql);
		} catch (e) {
			return (e as Error).message;
		}
		return "accepted";
	};

	test("a status never moves back, identifiers never change, rows are never deleted", () => {
		expect(refused("update tax_documents set status = 'processing'")).toContain(
			"tax_document_status_flow",
		);
		expect(refused("update tax_documents set generation_code = 'X'")).toContain(
			"tax_document_fixed",
		);
		expect(refused("delete from tax_documents")).toContain(
			"tax_documents_are_permanent",
		);
	});

	test("an order has one live Factura at a time", () => {
		expect(
			refused(
				"insert into tax_documents (order_id, dte_type, idempotency_key, request, expected_total, public_token, created_by) values (1, '01', 'k2', '{}', 3000, 't2', 'u')",
			),
		).toContain("UNIQUE constraint failed: tax_documents.order_id");
	});
});
