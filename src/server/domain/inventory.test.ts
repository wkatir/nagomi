import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { migratedDatabase, orderSql } from "#/db/test-database";
import { linesBeyondStock, sellableByVariant } from "./inventory";

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
${orderSql({ id: 1, status: "pending", lines: [{ variantId: 1, quantity: 1, unitPrice: 1000 }] })}
${orderSql({ id: 2, status: "shipped", lines: [{ variantId: 2, quantity: 1, unitPrice: 1000 }] })}
${orderSql({ id: 3, status: "cancelled", lines: [{ variantId: 1, quantity: 2, unitPrice: 1000 }] })}
`);
	db = drizzle(raw, { schema }) as unknown as Db;
});

describe("sellableByVariant", () => {
	test("is the units left in the lots: an order took its units, a cancelled one gave them back", async () => {
		const sellable = await sellableByVariant(db, [1, 2]);
		expect([...sellable]).toEqual([
			[1, 6],
			[2, 1],
		]);
	});

	test("a size without lots has none", async () => {
		expect((await sellableByVariant(db, [99])).get(99)).toBe(0);
	});
});

describe("linesBeyondStock", () => {
	test("lists the lines that do not fit, with what is left, and keeps their fields", async () => {
		expect(
			await linesBeyondStock(db, [
				{ variantId: 1, quantity: 6, sku: "SKU-001" },
				{ variantId: 2, quantity: 2, sku: "SKU-002" },
			]),
		).toEqual([{ variantId: 2, quantity: 2, sku: "SKU-002", available: 1 }]);
	});

	test("adds up the lines of the same size, alone and inside a set", async () => {
		expect(
			await linesBeyondStock(db, [
				{ variantId: 1, quantity: 4 },
				{ variantId: 1, quantity: 3 },
			]),
		).toEqual([
			{ variantId: 1, quantity: 4, available: 6 },
			{ variantId: 1, quantity: 3, available: 6 },
		]);
	});
});
