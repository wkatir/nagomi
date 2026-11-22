import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase, orderSql } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
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
const body = async (res: Response) =>
	(await res.json()) as Record<string, unknown>;

let db: Database;
const onHand = () =>
	(
		db
			.query(
				"select sum(quantity) as n from inventory_movements where lot_id = 1",
			)
			.get() as { n: number }
	).n;
const statusOf = (id: number) =>
	(
		db.query(`select status from orders where id = ${id}`).get() as {
			status: string;
		}
	).status;
const ago = (hours: number) =>
	new Date(Date.now() - hours * 3_600_000)
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z");
const line = (quantity: number) => [
	{ variantId: 1, quantity, unitPrice: 1500, sku: "TEC-001" },
];

// One product with 3 units that expire long after today.
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold, followup_pending_payment_hours, followup_paid_unshipped_hours, followup_shipped_undelivered_hours) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5, 48, 24, 96);
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Teclados');
insert into products (slug, brand_id, category_id) values ('teclado', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado', 'teclado');
insert into variants (product_id, sku, price, search_key) values (1, 'TEC-001', 1500, 'tec-001');
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

describe("admin order lifecycle", () => {
	test("a transfer is recorded, then the order is shipped and delivered", async () => {
		db.exec(orderSql({ id: 1, lines: line(2) }));
		expect(onHand()).toBe(1);
		expect(
			(await send("POST", "/orders/1/ship", { courier: "C807" })).status,
		).toBe(409);
		const paid = await send("POST", "/orders/1/mark-paid", {
			reference: "TRF-1",
		});
		expect(paid.status).toBe(200);
		expect(await body(paid)).toEqual({ ok: true, amount: 3000 });
		expect(statusOf(1)).toBe("paid");
		expect((await send("POST", "/orders/1/mark-paid", {})).status).toBe(409);
		expect(
			(
				await send("POST", "/orders/1/ship", {
					courier: "C807 Xpress",
					trackingCode: "SV123",
				})
			).status,
		).toBe(200);
		expect(
			db
				.query("select status, courier, tracking_code from orders where id = 1")
				.get(),
		).toEqual({
			status: "shipped",
			courier: "C807 Xpress",
			tracking_code: "SV123",
		});
		expect(
			(await send("POST", "/orders/1/cancel", { reason: "x" })).status,
		).toBe(409);
		expect((await send("POST", "/orders/1/deliver", {})).status).toBe(200);
		expect(statusOf(1)).toBe("delivered");
		expect((await send("POST", "/orders/1/deliver", {})).status).toBe(409);
		expect(
			db
				.query(
					"select from_status, to_status from order_status_history where order_id = 1 order by id",
				)
				.all(),
		).toEqual([
			{ from_status: null, to_status: "pending" },
			{ from_status: "pending", to_status: "paid" },
			{ from_status: "paid", to_status: "shipped" },
			{ from_status: "shipped", to_status: "delivered" },
		]);
	});

	test("cash on delivery ships unpaid and is delivered only once its cash is recorded", async () => {
		db.exec(orderSql({ id: 1, method: "cash_on_delivery", lines: line(1) }));
		expect(
			(await send("POST", "/orders/1/ship", { courier: "Reparto" })).status,
		).toBe(200);
		const early = await send("POST", "/orders/1/deliver", {});
		expect(early.status).toBe(409);
		expect(await body(early)).toEqual({
			error: "order_not_paid",
			balance: 1500,
		});
		expect((await send("POST", "/orders/1/mark-paid", {})).status).toBe(200);
		expect(statusOf(1)).toBe("shipped");
		expect((await send("POST", "/orders/1/deliver", {})).status).toBe(200);
	});

	test("a card order is not shipped before it is paid", async () => {
		db.exec(orderSql({ id: 1, method: "card", lines: line(1) }));
		expect(
			(await send("POST", "/orders/1/ship", { courier: "Reparto" })).status,
		).toBe(409);
		expect((await send("POST", "/orders/1/ship", {})).status).toBe(400);
	});

	test("cancelling a pending or paid order puts its units back", async () => {
		db.exec(
			`${orderSql({ id: 1, lines: line(2) })}\n${orderSql({ id: 2, status: "paid", lines: line(1) })}`,
		);
		expect(onHand()).toBe(0);
		expect((await send("POST", "/orders/1/cancel", {})).status).toBe(400);
		expect(
			(await send("POST", "/orders/1/cancel", { reason: "Desistió" })).status,
		).toBe(200);
		expect(onHand()).toBe(2);
		expect(
			(await send("POST", "/orders/2/cancel", { reason: "Desistió" })).status,
		).toBe(200);
		expect(onHand()).toBe(3);
		expect(
			db
				.query(
					"select kind, quantity, created_by from inventory_movements where kind = 'cancellation' order by id",
				)
				.all(),
		).toEqual([
			{ kind: "cancellation", quantity: 2, created_by: "admin" },
			{ kind: "cancellation", quantity: 1, created_by: "admin" },
		]);
		expect(
			(await send("POST", "/orders/1/cancel", { reason: "otra vez" })).status,
		).toBe(409);
	});

	test("expiring cancels only overdue unpaid card and transfer orders, once", async () => {
		db.exec(
			[
				orderSql({
					id: 1,
					method: "bank_transfer",
					createdAt: ago(60),
					lines: line(1),
				}),
				orderSql({ id: 2, method: "card", createdAt: ago(10), lines: line(1) }),
				orderSql({
					id: 3,
					method: "cash_on_delivery",
					createdAt: ago(60),
					lines: line(1),
				}),
			].join("\n"),
		);
		const res = await send("POST", "/orders/expire-pending", {});
		expect(res.status).toBe(200);
		expect(await body(res)).toEqual({
			cancelled: [{ id: 1, code: "NAG-000001" }],
		});
		expect([statusOf(1), statusOf(2), statusOf(3)]).toEqual([
			"cancelled",
			"pending",
			"pending",
		]);
		expect(onHand()).toBe(1);
		expect(
			await body(await send("POST", "/orders/expire-pending", {})),
		).toEqual({
			cancelled: [],
		});
		expect(onHand()).toBe(1);
	});
});
