import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import {
	linesBeyondStock,
	type StockClock,
	sellableByVariant,
	stockFits,
} from "./inventory";

// Today 2026-10-18 in El Salvador: pending orders placed from the start of yesterday hold.
const clock: StockClock = {
	today: "2026-10-18",
	holdStart: "2026-10-17T06:00:00Z",
};

const confirm = (id: number) =>
	`update orders set status = 'confirmed', confirmed_at = '2026-10-01T00:00:00Z', payment_method = 'cash', shipping_method = 'pickup', delivery_estimate_from = '2026-10-02', delivery_estimate_to = '2026-10-02', confirmation_message = 'm' where id = ${id};`;
const order = (
	id: number,
	createdAt: string,
	variantId: number,
	quantity: number,
) =>
	`insert into orders (id, code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key, created_at) values (${id}, 'O-${id}', 'k${id}', 'h', 'es', 'whatsapp', ${quantity * 1000}, ${quantity * 1000}, 'o-${id}', '${createdAt}');
insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (${id}, ${variantId}, ${quantity}, 1000, 'SKU-${variantId}', 'Brand', 'Name');`;

let raw: Database;
let db: Db;
beforeEach(() => {
	raw = migratedDatabase();
	// Variant 1: 7 units in two lots. Variant 2: 2 units.
	raw.exec(`
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('c', 'package', 1);
insert into products (slug, brand_id, category_id) values ('p', 1, 1);
insert into variants (product_id, sku, price, search_key) values (1, 'SKU-001', 1000, 'sku-1'), (1, 'SKU-002', 1000, 'sku-2');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-09-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 7, 700), (1, 2, 2, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-09-02', 'u'), (1, '2026-09-03', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 4, 0), (2, 1, 3, 0), (1, 2, 2, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 70000), (1, 2, 70000), (2, 3, 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 4, 'u'), (2, 'receive', 3, 'u'), (3, 'receive', 2, 'u');
-- Pending, placed at the hold start: holds 1 unit of variant 1.
${order(1, "2026-10-17T06:00:00Z", 1, 1)}
-- Pending, placed one second before: past its confirmation deadline, holds nothing.
${order(2, "2026-10-17T05:59:59Z", 1, 1)}
-- Confirmed long ago: holds 1 unit of variant 2 until it ships.
${order(3, "2026-09-05T00:00:00Z", 2, 1)}
${confirm(3)}
-- Shipped and cancelled orders hold nothing.
${order(4, "2026-09-05T00:00:00Z", 2, 1)}
${confirm(4)}
update orders set status = 'fulfilled', fulfilled_at = '2026-10-02T00:00:00Z' where id = 4;
${order(5, "2026-10-18T01:00:00Z", 1, 2)}
update orders set status = 'cancelled', cancelled_at = '2026-10-18T02:00:00Z' where id = 5;
`);
	db = drizzle(raw, { schema }) as unknown as Db;
});

// drizzle's raw `get` on bun:sqlite returns the row's values.
const fits = (
	lines: { variantId: number; quantity: number }[],
	at = clock,
	excludeOrderId: number | null = null,
) => {
	const [ok] = drizzle(raw).get<[number]>(
		sql`select ${stockFits(lines, at, excludeOrderId)}`,
	);
	return ok === 1;
};

describe("sellableByVariant", () => {
	test("is units in every lot minus units held by open orders", async () => {
		const sellable = await sellableByVariant(db, clock, [1, 2]);
		expect([...sellable]).toEqual([
			[1, 6],
			[2, 1],
		]);
	});

	test("a pending order holds from the hold start on, to the second", async () => {
		const later = { ...clock, holdStart: "2026-10-17T06:00:01Z" };
		const earlier = { ...clock, holdStart: "2026-10-17T05:59:59Z" };
		expect((await sellableByVariant(db, later, [1])).get(1)).toBe(7);
		expect((await sellableByVariant(db, earlier, [1])).get(1)).toBe(5);
	});

	test("leaves out the order being edited or confirmed", async () => {
		expect((await sellableByVariant(db, clock, [1], 1)).get(1)).toBe(7);
		expect((await sellableByVariant(db, clock, [2], 3)).get(2)).toBe(2);
	});
});

describe("stockFits", () => {
	test("accepts exactly the sellable units and refuses one more", () => {
		expect(fits([{ variantId: 1, quantity: 6 }])).toBe(true);
		expect(fits([{ variantId: 1, quantity: 7 }])).toBe(false);
		expect(fits([{ variantId: 2, quantity: 1 }])).toBe(true);
		expect(fits([{ variantId: 2, quantity: 2 }])).toBe(false);
	});

	test("every line must fit", () => {
		expect(
			fits([
				{ variantId: 1, quantity: 6 },
				{ variantId: 2, quantity: 1 },
			]),
		).toBe(true);
		expect(
			fits([
				{ variantId: 1, quantity: 6 },
				{ variantId: 2, quantity: 2 },
			]),
		).toBe(false);
	});

	test("follows the same hold and exclusion as sellableByVariant", () => {
		expect(
			fits([{ variantId: 1, quantity: 7 }], {
				...clock,
				holdStart: "2026-10-17T06:00:01Z",
			}),
		).toBe(true);
		expect(fits([{ variantId: 1, quantity: 7 }], clock, 1)).toBe(true);
		expect(fits([{ variantId: 1, quantity: 8 }], clock, 1)).toBe(false);
	});
});

describe("linesBeyondStock", () => {
	test("lists the lines that do not fit, with what is left, and keeps their fields", async () => {
		expect(
			await linesBeyondStock(db, clock, [
				{ variantId: 1, quantity: 6, sku: "SKU-001" },
				{ variantId: 2, quantity: 2, sku: "SKU-002" },
			]),
		).toEqual([{ variantId: 2, quantity: 2, sku: "SKU-002", available: 1 }]);
	});
});
