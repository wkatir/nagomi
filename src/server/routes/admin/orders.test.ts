import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { ordersRouter } = await import("./orders");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/orders", ordersRouter);

const send = (method: string, path: string, body: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
const create = (quantity: number) =>
	send("POST", "/orders", {
		idempotencyKey: crypto.randomUUID(),
		channel: "in_person",
		items: [{ variantId: 1, quantity }],
	});
const confirm = (id: number) =>
	send("POST", `/orders/${id}/confirm`, {
		paymentMethod: "cash",
		paid: false,
		shippingMethod: "pickup",
		deliveryFrom: "2099-01-01",
		deliveryTo: "2099-01-01",
	});
const short = (requested: number, available: number) => ({
	error: "insufficient_stock",
	lines: [{ variantId: 1, sku: "OIL", requested, available }],
});

const body = async (res: Response) =>
	(await res.json()) as Record<string, unknown>;

let db: Database;
const orderCount = () =>
	(db.query("select count(*) as n from orders").get() as { n: number }).n;

// One product with 3 units that expire long after today.
beforeEach(() => {
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
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 3, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 3, 0);
insert into lots (variant_id, receipt_line_id, expires_on, unit_cost_e4) values (1, 1, '2099-12-31', 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 3, 'u');
`);
	env.DB = d1(db);
});

describe("admin orders and stock", () => {
	test("a new order takes at most the units left", async () => {
		const refused = await create(4);
		expect(refused.status).toBe(409);
		expect(await body(refused)).toEqual(short(4, 3));
		expect(orderCount()).toBe(0);
		expect((await create(3)).status).toBe(201);
		expect(await body(await create(1))).toEqual(short(1, 0));
	});

	test("an edit can use the order's own units, not more", async () => {
		expect((await create(2)).status).toBe(201);
		const edit = (quantity: number) =>
			send("PATCH", "/orders/1", { items: [{ variantId: 1, quantity }] });
		expect((await edit(3)).status).toBe(200);
		const refused = await edit(4);
		expect(refused.status).toBe(409);
		expect(await body(refused)).toEqual(short(4, 3));
		expect(
			db.query("select quantity from order_items where order_id = 1").get(),
		).toEqual({ quantity: 3 });
	});

	test("an overdue order whose units were taken cannot be confirmed", async () => {
		// Placed long ago and never confirmed: past its deadline, it holds nothing.
		db.exec(`
insert into orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key, created_at) values ('OLD-1', '00000000-0000-4000-8000-000000000000', 'h', 'es', 'whatsapp', 4500, 4500, 'old-1', '2026-01-03T00:00:00Z');
insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (1, 1, 3, 1500, 'OIL', 'Brand', 'Aceite');
`);
		expect((await create(3)).status).toBe(201);
		const refused = await confirm(1);
		expect(refused.status).toBe(409);
		expect(await body(refused)).toEqual(short(3, 0));
		expect((await confirm(2)).status).toBe(200);
	});

	test("cancelling releases the units at once", async () => {
		expect((await create(3)).status).toBe(201);
		expect((await create(1)).status).toBe(409);
		expect((await send("POST", "/orders/1/cancel", {})).status).toBe(200);
		expect((await create(1)).status).toBe(201);
	});
});
