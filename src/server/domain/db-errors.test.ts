import { describe, expect, test } from "bun:test";
import { migrations } from "#/db/test-database";
import { DB_ERRORS, mapDbError } from "./db-errors";

describe("mapDbError", () => {
	test("maps a negative lot balance to stock_changed", () => {
		const d1 = new Error(
			"D1_ERROR: lot_balance_negative: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)",
		);
		expect(mapDbError(d1)).toEqual({
			status: 409,
			error: "stock_changed",
			cause: "lot_balance_negative",
		});
	});

	test("finds the code in a wrapped error's cause", () => {
		const wrapped = new Error("Failed query: insert into ...", {
			cause: new Error("receipt_exceeds_ordered: SQLITE_CONSTRAINT"),
		});
		expect(mapDbError(wrapped)?.error).toBe("receipt_exceeds_ordered");
	});

	test("maps known unique keys", () => {
		const e = new Error(
			"D1_ERROR: UNIQUE constraint failed: purchase_orders.supplier_id, purchase_orders.reference: SQLITE_CONSTRAINT",
		);
		expect(mapDbError(e)?.error).toBe("duplicate_reference");
		expect(
			mapDbError(new Error("UNIQUE constraint failed: variants.sku"))?.error,
		).toBe("duplicate_sku");
		expect(
			mapDbError(
				new Error(
					"UNIQUE constraint failed: product_images.product_id, product_images.media_file_id",
				),
			)?.error,
		).toBe("duplicate_image");
		expect(
			mapDbError(
				new Error(
					"UNIQUE constraint failed: supplier_items.supplier_id, supplier_items.variant_id",
				),
			)?.error,
		).toBe("duplicate_supplier_item");
		expect(
			mapDbError(
				new Error("UNIQUE constraint failed: supplier_items.variant_id"),
			)?.error,
		).toBe("preferred_supplier_taken");
		expect(
			mapDbError(new Error("UNIQUE constraint failed: promotions.code"))?.error,
		).toBe("duplicate_code");
		expect(
			mapDbError(new Error("UNIQUE constraint failed: shipping_zones.slug"))
				?.error,
		).toBe("duplicate_slug");
		expect(
			mapDbError(
				new Error(
					"D1_ERROR: promotion_usage_limit: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)",
				),
			)?.error,
		).toBe("promotion_limit_reached");
		expect(
			mapDbError(
				new Error(
					"D1_ERROR: lot_balance_negative: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)",
				),
			)?.error,
		).toBe("stock_changed");
		expect(
			mapDbError(
				new Error(
					"UNIQUE constraint failed: promotion_redemptions.promotion_id, promotion_redemptions.customer_key",
				),
			)?.error,
		).toBe("promotion_limit_reached");
	});

	test("leaves everything else alone", () => {
		expect(mapDbError(new Error("D1_ERROR: no such table: x"))).toBeNull();
		expect(
			mapDbError(
				new Error("D1_ERROR: orders_are_permanent: SQLITE_CONSTRAINT"),
			),
		).toBeNull();
		expect(
			mapDbError(new Error("UNIQUE constraint failed: orders.code")),
		).toBeNull();
		expect(mapDbError("lot_balance_negative")).toBeNull();
		// A longer identifier that merely contains a code is not that code.
		expect(mapDbError(new Error("x_lot_balance_negative_y"))).toBeNull();
	});
});

test("every mapped code is raised by a trigger", () => {
	const sql = migrations.join("\n");
	for (const code of Object.keys(DB_ERRORS))
		expect(sql).toContain(`RAISE(ABORT, '${code}')`);
});
