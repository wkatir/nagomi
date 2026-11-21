import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import { loadBookings, loadSales } from "./report-data";

const range = {
	from: "2026-10-01",
	to: "2026-10-31",
	timeZone: "America/El_Salvador",
};

// A pending order taken through confirmation and fulfilment, as the triggers allow.
function fulfilledOrder(sqlite: Database, id: number, subtotal: number) {
	sqlite.exec(
		`insert into orders (id, code, idempotency_key, request_hash, search_key, locale, channel, subtotal, total) values (${id}, 'E-${id}', 'key-${id}', 'hash', 'e-${id}', 'es', 'whatsapp', ${subtotal}, ${subtotal})`,
	);
	if (subtotal > 0)
		sqlite.exec(
			`insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (${id}, 1, 1, ${subtotal}, 'OIL', 'SKIN1004', 'Aceite')`,
		);
	sqlite.exec(
		`update orders set status = 'confirmed', confirmed_at = '2026-10-10T15:00:00Z', payment_method = 'cash', shipping_method = 'pickup', delivery_estimate_from = '2026-10-11', delivery_estimate_to = '2026-10-11', confirmation_message = 'ok' where id = ${id}`,
	);
	sqlite.exec(
		`update orders set status = 'fulfilled', fulfilled_at = '2026-10-10T16:00:00Z' where id = ${id}`,
	);
}

let sqlite: Database;
let db: Db;
beforeEach(() => {
	sqlite = migratedDatabase();
	sqlite.exec(`
		insert into brands (slug, name, search_key) values ('skin1004', 'SKIN1004', 'skin1004');
		insert into categories (slug, routine_step) values ('cleanser', 1);
		insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
		insert into variants (product_id, sku, price, search_key) values (1, 'OIL', 1500, 'oil');
		-- Units for the orders confirmed below: a confirmation beyond stock is refused.
		insert into suppliers (name, search_key) values ('Supplier', 'supplier');
		insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-10-01');
		insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 5, 700);
		insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-10-05', 'u');
		insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 5, 0);
		insert into lots (variant_id, receipt_line_id, expires_on, unit_cost_e4) values (1, 1, '2027-01-31', 70000);
		insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 5, 'u');
	`);
	fulfilledOrder(sqlite, 1, 1500);
	// drizzle's bun:sqlite driver has no batch; D1 runs a batch's statements in order.
	db = Object.assign(drizzle(sqlite, { schema }), {
		batch: (queries: readonly unknown[]) => Promise.all(queries),
	}) as unknown as Db;
});

// Only reachable if the data broke the invariant: the trigger is dropped to write it.
const orderWithoutLines = () => {
	sqlite.exec("drop trigger orders_require_lines");
	fulfilledOrder(sqlite, 2, 0);
};

describe("loadSales", () => {
	test("each sale carries its order's lines", async () => {
		const [sale] = await loadSales(db, range);
		expect(sale.orderId).toBe(1);
		expect(sale.day).toBe("2026-10-10");
		expect(sale.revenue).toBe(1500);
		expect(sale.lines.map((l) => [l.orderItemId, l.units])).toEqual([[1, 1]]);
	});

	test("an order without lines fails instead of counting as $0", async () => {
		orderWithoutLines();
		await expect(loadSales(db, range)).rejects.toThrow("Order 2 has no lines");
	});
});

describe("loadBookings", () => {
	test("values each booked order with its lines", async () => {
		expect(await loadBookings(db, range)).toEqual({ orders: 1, value: 1500 });
	});

	test("an order without lines fails instead of counting as $0", async () => {
		orderWithoutLines();
		await expect(loadBookings(db, range)).rejects.toThrow(
			"Order 2 has no lines",
		);
	});
});
