import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import { ORDER_PAYMENT_STATUSES } from "#/lib/enums";
import { paymentStatusIs, promotionCodeOfOrder } from "./order-sql";
import { amountOwed, paymentSummary } from "./payments";

const { orders } = schema;

describe("promotionCodeOfOrder", () => {
	test("is the code the order was placed with, whatever its discount reason", () => {
		const raw = migratedDatabase();
		raw.exec(`
INSERT INTO promotions (code, type, value, status) VALUES ('HOLA10', 'percentage', 10, 'active');
INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, subtotal, discount, discount_reason, total, search_key, promotion_id) VALUES ('O-1', 'k1', 'h', 'es', 'whatsapp', 3400, 340, 'HOLA10', 3060, 'o-1', 1);
INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'es', 'whatsapp', 1700, 1700, 'o-2');
-- Confirmed with another discount and the admin's reason: the order keeps its code.
UPDATE orders SET status = 'confirmed', confirmed_at = '2026-10-16T00:00:00Z', discount = 500, discount_reason = 'Cliente frecuente', total = 2900 WHERE id = 1;
`);
		const db = drizzle(raw, { schema });
		const codeOf = (id: number) =>
			db
				.select({ code: promotionCodeOfOrder })
				.from(orders)
				.where(eq(orders.id, id))
				.get()?.code;
		expect(codeOf(1)).toBe("HOLA10");
		expect(codeOf(2)).toBeNull();
	});
});

// A small deterministic generator, so a failure names the same order every run.
const random = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 2 ** 32;
	return seed / 2 ** 32;
};

describe("paymentStatusIs", () => {
	test("gives every order the status paymentSummary gives it", () => {
		const raw = migratedDatabase();
		// The triggers guard the integrity of the data; this test only needs its rows.
		const triggers = raw
			.query("select name from sqlite_master where type = 'trigger'")
			.all() as { name: string }[];
		for (const { name } of triggers) raw.exec(`drop trigger "${name}"`);
		raw.exec(`
INSERT INTO brands (slug, name, search_key) VALUES ('b', 'Brand', 'brand');
INSERT INTO categories (slug, icon, sort_order) VALUES ('c', 'package', 1);
INSERT INTO products (slug, brand_id, category_id) VALUES ('p', 1, 1);
INSERT INTO variants (product_id, sku, price, search_key) VALUES (1, 'SKU-001', 1000, 'sku1'), (1, 'SKU-002', 1000, 'sku2'), (1, 'SKU-003', 1000, 'sku3');
INSERT INTO suppliers (name, search_key) VALUES ('S', 's');
INSERT INTO purchase_orders (supplier_id, reference, status, ordered_on) VALUES (1, 'PO', 'ordered', '2026-01-01');
INSERT INTO purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) VALUES (1, 1, 1000, 700);
INSERT INTO purchase_receipts (purchase_order_id, received_on, created_by) VALUES (1, '2026-01-02', 'u');
INSERT INTO purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) VALUES (1, 1, 1000, 0);
INSERT INTO lots (variant_id, receipt_line_id, unit_cost_e4) VALUES (1, 1, 70000);
`);
		const next = random(7);
		const pick = <T>(values: readonly T[]) =>
			values[Math.floor(next() * values.length)] as T;
		const expected = new Map<number, string>();
		for (let id = 1; id <= 400; id++) {
			const status = pick([
				"pending",
				"confirmed",
				"fulfilled",
				"delivered",
				"cancelled",
			] as const);
			const lines = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
				quantity: 1 + Math.floor(next() * 4),
				unitPrice: pick([500, 1250, 1999]),
			}));
			const subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
			const discount = pick([
				0,
				0,
				1,
				Math.floor(subtotal / 10),
				Math.floor(subtotal / 3),
			]);
			const shipping = pick([0, 0, 350, 500]);
			raw.exec(
				`INSERT INTO orders (id, code, idempotency_key, request_hash, locale, channel, status, subtotal, discount, discount_reason, shipping, total, search_key) VALUES (${id}, 'O-${id}', 'k${id}', 'h', 'es', 'whatsapp', '${status}', ${subtotal}, ${discount}, ${discount > 0 ? "'promo'" : "NULL"}, ${shipping}, ${subtotal - discount + shipping}, 'o-${id}')`,
			);
			const owedLines = lines.map((line, n) => {
				raw.exec(
					`INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (${id}, ${n + 1}, ${line.quantity}, ${line.unitPrice}, 'SKU', 'Brand', 'P')`,
				);
				const itemId = (
					raw.query("select last_insert_rowid() as id").get() as { id: number }
				).id;
				const returned =
					next() < 0.4 ? Math.floor(next() * (line.quantity + 1)) : 0;
				if (returned > 0) {
					raw.exec(
						`INSERT INTO returns (order_id, reason, created_by) VALUES (${id}, 'other', 'u')`,
					);
					raw.exec(
						`INSERT INTO return_lines (return_id, order_item_id, lot_id, quantity, disposition) VALUES (last_insert_rowid(), ${itemId}, 1, ${returned}, 'restock')`,
					);
				}
				return { ...line, returned };
			});
			const owed = amountOwed({
				status,
				subtotal,
				discount,
				shipping,
				lines: owedLines,
			});
			const total = subtotal - discount + shipping;
			const paid = pick([
				0,
				0,
				total,
				Math.floor(total / 2),
				total + 100,
				owed,
			]);
			const refunded = paid > 0 ? pick([0, 0, Math.floor(paid / 3), paid]) : 0;
			// Payments in two parts, a pending one that must not count, and a refund.
			const parts =
				paid > 1
					? [Math.floor(paid / 2), paid - Math.floor(paid / 2)]
					: paid === 1
						? [1]
						: [];
			for (const amount of parts)
				raw.exec(
					`INSERT INTO payments (order_id, kind, method, amount, status, recorded_by) VALUES (${id}, 'payment', 'cash', ${amount}, 'confirmed', 'u')`,
				);
			raw.exec(
				`INSERT INTO payments (order_id, kind, method, amount, status, recorded_by) VALUES (${id}, 'payment', 'cash', 777, 'pending', 'u')`,
			);
			if (refunded > 0)
				raw.exec(
					`INSERT INTO payments (order_id, kind, method, amount, status, recorded_by) VALUES (${id}, 'refund', 'cash', ${refunded}, 'confirmed', 'u')`,
				);
			expected.set(id, paymentSummary(owed, paid, refunded).status);
		}

		const db = drizzle(raw, { schema });
		const seen = new Map<string, number>();
		for (const status of ORDER_PAYMENT_STATUSES) {
			const ids = db
				.select({ id: orders.id })
				.from(orders)
				.where(paymentStatusIs(status))
				.all()
				.map((r) => r.id)
				.sort((a, b) => a - b);
			const want = [...expected]
				.filter(([, s]) => s === status)
				.map(([id]) => id);
			expect(ids).toEqual(want);
			seen.set(status, ids.length);
		}
		// The data reaches every status, so each comparison above means something.
		for (const status of ORDER_PAYMENT_STATUSES)
			expect(seen.get(status) ?? 0).toBeGreaterThan(0);
	});
});
