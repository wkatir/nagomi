import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";

const env: {
	DB?: ReturnType<typeof d1>;
	ORDER_LIMITER: { limit: () => Promise<{ success: boolean }> };
} = { ORDER_LIMITER: { limit: async () => ({ success: true }) } };
mock.module("cloudflare:workers", () => ({ env }));
const { apiError } = await import("../api-error");
const { storefront } = await import("./storefront");

const app = new Hono().route("/", storefront).onError(apiError);

const order = (
	quantity: number,
	idempotencyKey = crypto.randomUUID(),
	phone?: string,
) =>
	app.request("/orders/whatsapp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"cf-connecting-ip": "203.0.113.7",
		},
		body: JSON.stringify({
			idempotencyKey,
			locale: "es",
			items: [{ sku: "OIL-001", quantity }],
			phone,
			consents: {
				privacyNotice: true,
				terms: true,
				marketingEmail: false,
				marketingWhatsapp: false,
			},
		}),
	});

const body = async (res: Response) =>
	(await res.json()) as Record<string, unknown>;

let db: Database;
const count = (table: string) =>
	(db.query(`select count(*) as n from ${table}`).get() as { n: number }).n;

// A store with checkout open and one product with 3 units that expire long after today.
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, whatsapp_number, legal_name, tax_id_label, tax_id, address, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', '50360000000', 'Store, S.A.S.', 'NIT', '0614-010101-101-1', 'San Salvador', 'America/El_Salvador', 'SV', 'ECL', 20, 5);
insert into pages (slug, is_published) values ('privacy', 1), ('terms', 1);
insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', 1, 'Aviso', 'Texto'), (2, 'es', 1, 'Términos', 'Texto');
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('cleanser', 'package', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Limpiador');
insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-001', 1500, 'oil');
update products set status = 'published' where id = 1;
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 3, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 3, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 3, 'u');
`);
	env.DB = d1(db);
});

describe("POST /orders/whatsapp phone", () => {
	test("a phone that cannot exist is refused with invalid_phone, writing nothing", async () => {
		const res = await order(1, crypto.randomUUID(), "123");
		expect(res.status).toBe(400);
		expect(await body(res)).toEqual({ error: "invalid_phone" });
		expect(count("orders")).toBe(0);
	});

	test("a valid phone is stored in E.164", async () => {
		const res = await order(1, crypto.randomUUID(), "7123-4567");
		expect(res.status).toBe(201);
		expect(
			(
				db.query("select customer_phone from orders").get() as {
					customer_phone: string;
				}
			).customer_phone,
		).toBe("+50371234567");
	});
});

describe("POST /orders/whatsapp and stock", () => {
	test("takes exactly the units left and refuses one more, writing nothing", async () => {
		const rows = () =>
			["orders", "order_items", "customer_consents"].map(count);
		expect((await order(3)).status).toBe(201);
		const placed = rows();
		expect(placed.slice(0, 2)).toEqual([1, 1]);
		const refused = await order(1);
		expect(refused.status).toBe(409);
		expect(await body(refused)).toEqual({
			error: "insufficient_stock",
			items: [{ sku: "OIL-001", available: 0 }],
		});
		expect(rows()).toEqual(placed);
	});

	test("checks the line limit before stock", async () => {
		const res = await order(21);
		expect(res.status).toBe(400);
		expect(await body(res)).toEqual({
			error: "quantity_exceeds_limit",
			max: 20,
		});
	});

	test("a retry returns the placed order after its units are gone", async () => {
		const key = crypto.randomUUID();
		const placed = await order(3, key);
		expect(placed.status).toBe(201);
		const retry = await order(3, key);
		expect(retry.status).toBe(200);
		expect((await body(retry)).code).toBe((await body(placed)).code);
		expect(count("orders")).toBe(1);
	});

	test("two customers ordering the last units: one gets them", async () => {
		const statuses = (await Promise.all([order(3), order(3)])).map(
			(r) => r.status,
		);
		expect(statuses.sort()).toEqual([201, 409]);
		expect(count("orders")).toBe(1);
	});

	test("a pending order past its confirmation deadline no longer holds units", async () => {
		db.exec(`
insert into orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key, created_at) values ('OLD-1', 'old', 'h', 'es', 'whatsapp', 4500, 4500, 'old-1', '2026-01-03T00:00:00Z');
insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (1, 1, 3, 1500, 'OIL-001', 'Brand', 'Aceite');
`);
		expect((await order(3)).status).toBe(201);
	});
});
