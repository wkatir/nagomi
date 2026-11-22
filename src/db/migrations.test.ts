import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { migratedDatabase as migrated, migrations } from "./test-database";

function expectedTriggers() {
	const created = new Set<string>();
	for (const file of migrations) {
		for (const m of file.matchAll(/CREATE TRIGGER `([a-z_]+)`/g))
			created.add(m[1] as string);
		for (const m of file.matchAll(/DROP TRIGGER (?:IF EXISTS )?`?([a-z_]+)`?/g))
			created.delete(m[1] as string);
	}
	return created;
}

const refused = (db: Database, sql: string) => {
	try {
		db.exec(sql);
	} catch (e) {
		return (e as Error).message;
	}
	return "accepted";
};

describe("migrations", () => {
	test("every trigger the migrations create exists afterwards", () => {
		const db = migrated();
		const present = new Set(
			db
				.query("select name from sqlite_master where type = 'trigger'")
				.all()
				.map((r) => (r as { name: string }).name),
		);
		const expected = expectedTriggers();
		expect([...expected].filter((t) => !present.has(t))).toEqual([]);
		// The rules the store relies on most, so they cannot vanish from the files unseen.
		for (const name of [
			"inventory_movements_lot_not_negative",
			"inventory_movements_no_update",
			"inventory_movements_no_delete",
			"orders_status_transition",
			"orders_terms_locked",
			"orders_no_delete",
			"payments_refund_within_paid_insert",
			"return_lines_within_sold",
			"purchase_receipt_lines_within_ordered",
			"audit_events_no_update",
			"products_publish_requires_price_insert",
			"variants_product_locked",
			"orders_require_lines",
			"variants_price_history_update",
			"bundles_published_price_below_items",
			"variants_bundle_price_below_items",
			"orders_status_history_paid",
			"customer_consents_page_matches_purpose",
			"purchase_orders_active_supplier_insert",
			"supplier_items_no_delete",
			"supplier_items_identity_locked",
			"media_files_locked",
			"promotions_terms_locked",
			"promotion_redemptions_usage_limit",
			"promotion_redemptions_first_order",
			"promotion_redemptions_matches_order",
			"orders_promotion_discount_insert",
			"orders_paid_requires_payment",
			"orders_units_taken",
			"orders_cancel_returns_stock",
			"orders_cancel_releases_coupon",
			"product_reviews_requires_delivered_order",
		])
			expect(present.has(name)).toBe(true);
	});

	test("an order's ledger rows are found through indexes, not a ledger scan", () => {
		const db = migrated();
		// The lookup of orderDetail (src/server/domain/order-queries.ts).
		const plan = db
			.query(
				"EXPLAIN QUERY PLAN select * from inventory_movements where id in (select m.id from inventory_movements m where m.order_item_id in (select oi.id from order_items oi where oi.order_id = 1) union select m.id from inventory_movements m where m.return_line_id in (select rl.id from return_lines rl join returns r on r.id = rl.return_id where r.order_id = 1))",
			)
			.all()
			.map((r) => (r as { detail: string }).detail);
		expect(plan.filter((d) => /^SCAN /.test(d))).toEqual([]);
		expect(plan.join("\n")).toContain("inventory_movements_order_item_idx");
		expect(plan.join("\n")).toContain("inventory_movements_return_line_idx");
	});

	test("an order's audit trail (its own events and its payments' and returns') uses indexes", () => {
		const db = migrated();
		const plan = db
			.query(
				"EXPLAIN QUERY PLAN select * from audit_events where (entity_type = 'order' and entity_id = '1') or json_extract(data, '$.orderId') = 1",
			)
			.all()
			.map((r) => (r as { detail: string }).detail)
			.join("\n");
		expect(plan).not.toMatch(/SCAN audit_events/);
		expect(plan).toContain("audit_events_entity_idx");
		expect(plan).toContain("audit_events_order_idx");
	});

	test("no generated SQL rebuilds or drops a table", () => {
		for (const file of migrations)
			expect(file).not.toMatch(/__new_|DROP TABLE|PRAGMA foreign_keys/);
	});
});

describe("integrity triggers", () => {
	let db: Database;
	beforeEach(() => {
		db = migrated();
		db.exec(`
INSERT INTO brands (slug, name, search_key) VALUES ('b', 'Brand', 'brand b');
INSERT INTO categories (slug, icon, sort_order) VALUES ('c', 'package', 1);
INSERT INTO products (slug, brand_id, category_id) VALUES ('p', 1, 1);
INSERT INTO variants (product_id, sku, price, search_key) VALUES (1, 'SKU-001', 1700, 'sku-1');
UPDATE products SET status = 'published' WHERE id = 1;
INSERT INTO products (slug, brand_id, category_id) VALUES ('d', 1, 1);
INSERT INTO variants (product_id, sku, search_key) VALUES (2, 'SKU-002', 'sku-2');
INSERT INTO suppliers (name, search_key) VALUES ('Supplier', 'supplier');
INSERT INTO purchase_orders (supplier_id, reference, status, ordered_on) VALUES (1, 'PO-1', 'ordered', '2026-10-01');
INSERT INTO purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) VALUES (1, 1, 4, 700);
INSERT INTO purchase_receipts (purchase_order_id, received_on, created_by) VALUES (1, '2026-10-05', 'u');
INSERT INTO purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) VALUES (1, 1, 2, 0);
INSERT INTO lots (variant_id, receipt_line_id, unit_cost_e4) VALUES (1, 1, 70000);
INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) VALUES (1, 'receive', 2, 'u');
INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, payment_method, shipping_method, confirmation_message, subtotal, total, search_key, created_at) VALUES ('O-1', 'k1', 'h', 'Ana', 'ana@example.com', '+50371234567', 'es', 'web', 'bank_transfer', 'pickup', 'm', 1700, 1700, 'o-1', '2026-10-04T15:00:00Z');
INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (1, 1, 1, 1700, 'SKU-001', 'Brand', 'Name');
INSERT INTO pages (slug, is_published) VALUES ('privacy', 1);
INSERT INTO page_versions (page_id, locale, version, title, body_markdown) VALUES (1, 'es', 1, 'Aviso', 'Texto');
INSERT INTO pages (slug, is_published) VALUES ('terms', 1);
INSERT INTO page_versions (page_id, locale, version, title, body_markdown) VALUES (2, 'es', 1, 'Términos', 'Texto');
`);
	});
	test("a lot never goes below zero and the ledger is append-only", () => {
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, reason, created_by) VALUES (1, 'waste', -3, 'damaged', 'u')",
			),
		).toContain("lot_balance_negative");
		expect(
			refused(db, "UPDATE inventory_movements SET quantity = 9"),
		).toContain("inventory_movements_append_only");
		expect(refused(db, "DELETE FROM inventory_movements")).toContain(
			"inventory_movements_append_only",
		);
	});

	test("a lot is received once, with its receipt line's quantity", () => {
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) VALUES (1, 'receive', 2, 'u')",
			),
		).toContain("receive_mismatch");
	});

	const sale = (orderItem = 1, quantity = 1) =>
		`INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'sale', ${-quantity}, ${orderItem}, 'u')`;
	const payment = (order = 1, amount = 1700) =>
		`INSERT INTO payments (order_id, kind, method, amount, status, recorded_by) VALUES (${order}, 'payment', 'bank_transfer', ${amount}, 'confirmed', 'u')`;
	const pay =
		"UPDATE orders SET status = 'paid', paid_at = '2026-10-05T00:00:00Z' WHERE id = 1";
	const ship =
		"UPDATE orders SET status = 'shipped', shipped_at = '2026-10-05T01:00:00Z', courier = 'Reparto' WHERE id = 1";
	const deliver =
		"UPDATE orders SET status = 'delivered', delivered_at = '2026-10-06T00:00:00Z' WHERE id = 1";
	const cancel =
		"UPDATE orders SET status = 'cancelled', cancelled_at = '2026-10-05T02:00:00Z', cancelled_by = 'u' WHERE id = 1";
	const balance = () =>
		(
			db
				.query(
					"SELECT sum(quantity) AS n FROM inventory_movements WHERE lot_id = 1",
				)
				.get() as { n: number }
		).n;

	test("an order starts pending and keeps its identity", () => {
		expect(
			refused(
				db,
				"INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, status, payment_method, shipping_method, confirmation_message, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'Ana', 'ana@example.com', '+50371234567', 'es', 'web', 'paid', 'card', 'pickup', 'm', 0, 0, 'o-2')",
			),
		).toContain("order_must_start_pending");
		for (const change of [
			"code = 'X'",
			"locale = 'en'",
			"customer_email = 'otra@example.com'",
			"customer_phone = '+50377777777'",
		])
			expect(refused(db, `UPDATE orders SET ${change} WHERE id = 1`)).toContain(
				"order_identity_locked",
			);
	});

	test("the lines and terms are fixed when the order is placed", () => {
		expect(
			refused(db, "UPDATE order_items SET quantity = 2 WHERE id = 1"),
		).toContain("order_items_locked");
		expect(refused(db, "DELETE FROM order_items WHERE id = 1")).toContain(
			"order_items_are_permanent",
		);
		for (const change of [
			"ship_address_line = 'elsewhere'",
			"shipping_zone_name = 'Z'",
			"customer_name = 'Other'",
			"payment_method = 'card'",
			"shipping = 300, total = 2000",
		])
			expect(refused(db, `UPDATE orders SET ${change} WHERE id = 1`)).toContain(
				"order_terms_locked",
			);
		expect(
			refused(
				db,
				"UPDATE orders SET paid_at = '2026-01-01T00:00:00Z' WHERE id = 1",
			),
		).toContain("order_timestamps_locked");
	});

	test("an order leaves pending only with every unit taken and, to be paid, its total paid", () => {
		db.exec(payment());
		expect(refused(db, pay)).toContain("order_units_not_taken");
		db.exec(sale());
		expect(refused(db, pay)).toBe("accepted");
		expect(
			refused(
				db,
				"UPDATE orders SET paid_at = '1999-01-01T00:00:00Z' WHERE id = 1",
			),
		).toContain("order_timestamps_locked");
	});

	test("paid needs the money recorded", () => {
		db.exec(sale());
		expect(refused(db, pay)).toContain("order_not_paid");
		db.exec(payment(1, 1000));
		expect(refused(db, pay)).toContain("order_not_paid");
		db.exec(payment(1, 700));
		expect(refused(db, pay)).toBe("accepted");
	});

	test("pending, paid, shipped, delivered: no step is skipped and delivered is final", () => {
		db.exec(sale());
		expect(refused(db, ship)).toContain("invalid_order_transition");
		db.exec(payment());
		db.exec(pay);
		expect(refused(db, deliver)).toContain("invalid_order_transition");
		expect(
			refused(
				db,
				"UPDATE orders SET status = 'shipped', shipped_at = '2026-10-05T01:00:00Z' WHERE id = 1",
			),
		).toContain("order_status_data_missing");
		db.exec(ship);
		expect(refused(db, cancel)).toContain("invalid_order_transition");
		db.exec(deliver);
		for (const change of [
			"status = 'shipped'",
			"status = 'cancelled', cancelled_at = '2026-10-07T00:00:00Z'",
			"tracking_code = 'X1'",
			"courier = 'Otro'",
		])
			expect(refused(db, `UPDATE orders SET ${change} WHERE id = 1`)).not.toBe(
				"accepted",
			);
		const history = db
			.query(
				"SELECT from_status, to_status, changed_at FROM order_status_history WHERE order_id = 1 ORDER BY id",
			)
			.all();
		expect(history).toEqual([
			{
				from_status: null,
				to_status: "pending",
				changed_at: "2026-10-04T15:00:00Z",
			},
			{
				from_status: "pending",
				to_status: "paid",
				changed_at: "2026-10-05T00:00:00Z",
			},
			{
				from_status: "paid",
				to_status: "shipped",
				changed_at: "2026-10-05T01:00:00Z",
			},
			{
				from_status: "shipped",
				to_status: "delivered",
				changed_at: "2026-10-06T00:00:00Z",
			},
		]);
	});

	test("cash on delivery is shipped before it is paid and delivered once its cash is in", () => {
		db.exec(`
INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, payment_method, shipping_method, confirmation_message, subtotal, total, search_key, created_at) VALUES ('O-2', 'k2', 'h', 'Ana', 'ana@example.com', '+50371234567', 'es', 'web', 'cash_on_delivery', 'pickup', 'm', 1700, 1700, 'o-2', '2026-10-04T15:00:00Z');
INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (2, 1, 1, 1700, 'SKU-001', 'Brand', 'Name');`);
		db.exec(sale(2));
		expect(refused(db, ship.replace("WHERE id = 1", "WHERE id = 2"))).toBe(
			"accepted",
		);
		expect(
			refused(db, deliver.replace("WHERE id = 1", "WHERE id = 2")),
		).toContain("order_not_paid");
		db.exec(payment(2));
		expect(refused(db, deliver.replace("WHERE id = 1", "WHERE id = 2"))).toBe(
			"accepted",
		);
	});

	test("cancelling a pending or paid order puts every unit back in its lot", () => {
		db.exec(sale());
		expect(balance()).toBe(1);
		db.exec(cancel);
		expect(balance()).toBe(2);
		expect(
			db
				.query(
					"SELECT kind, quantity, order_item_id, created_at, created_by FROM inventory_movements WHERE kind = 'cancellation'",
				)
				.all(),
		).toEqual([
			{
				kind: "cancellation",
				quantity: 1,
				order_item_id: 1,
				created_at: "2026-10-05T02:00:00Z",
				created_by: "u",
			},
		]);
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'cancellation', 1, 1, 'u')",
			),
		).toContain("cancellation_exceeds_sale");
		expect(refused(db, sale())).not.toBe("accepted");
	});

	test("a cancellation is only for a cancelled order, and never above what left the lot", () => {
		db.exec(sale());
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'cancellation', 1, 1, 'u')",
			),
		).toContain("order_not_cancelled");
	});

	test("sales stay within the line and the lot", () => {
		db.exec(sale());
		expect(refused(db, sale())).toContain("sale_exceeds_order_line");
		db.exec(`
INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, payment_method, shipping_method, confirmation_message, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'Ana', 'ana@example.com', '+50371234567', 'es', 'web', 'card', 'pickup', 'm', 3400, 3400, 'o-2');
INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (2, 1, 2, 1700, 'SKU-001', 'Brand', 'Name');`);
		expect(refused(db, sale(2, 2))).toContain("lot_balance_negative");
	});

	test("return movements follow their return line", () => {
		db.exec(sale());
		db.exec(payment());
		db.exec(pay);
		db.exec(ship);
		db.exec(`
INSERT INTO returns (order_id, reason, created_by) VALUES (1, 'withdrawal', 'u');
INSERT INTO return_lines (return_id, order_item_id, lot_id, quantity, disposition) VALUES (1, 1, 1, 1, 'restock');`);
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, return_line_id, created_by) VALUES (1, 'return', 2, 1, 'u')",
			),
		).toContain("return_movement_exceeds_line");
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, reason, return_line_id, created_by) VALUES (1, 'waste', -1, 'customer_return', 1, 'u')",
			),
		).toContain("write_off_mismatch");
		expect(refused(db, "UPDATE returns SET reason = 'defective'")).toContain(
			"returns_are_permanent",
		);
		db.exec(
			"INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, payment_method, shipping_method, confirmation_message, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'Ana', 'ana@example.com', '+50371234567', 'es', 'web', 'card', 'pickup', 'm', 0, 0, 'o-2')",
		);
		expect(
			refused(
				db,
				"INSERT INTO payments (order_id, kind, method, amount, status, return_id, recorded_by) VALUES (2, 'refund', 'cash', 1, 'pending', 1, 'u')",
			),
		).toContain("refund_wrong_return");
	});

	test("purchase orders: status follows receipts, receipts are fixed, drafts editable", () => {
		expect(
			refused(db, "UPDATE purchase_orders SET status = 'received'"),
		).toContain("purchase_order_status_mismatch");
		expect(
			refused(db, "UPDATE purchase_receipts SET shipping_cost = 999"),
		).toContain("purchase_receipts_locked");
		expect(
			refused(db, "UPDATE purchase_order_items SET quantity = 1 WHERE id = 1"),
		).toContain("purchase_order_items_locked");
		expect(
			refused(db, "UPDATE purchase_receipts SET supplier_invoice_ref = 'F-1'"),
		).toBe("accepted");
		db.exec(`
INSERT INTO purchase_orders (supplier_id, reference) VALUES (1, 'DRAFT-1');
INSERT INTO purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) VALUES (2, 1, 1, 1);`);
		expect(
			refused(
				db,
				"DELETE FROM purchase_order_items WHERE purchase_order_id = 2",
			),
		).toBe("accepted");
		expect(
			refused(db, "DELETE FROM purchase_order_items WHERE id = 1"),
		).toContain("purchase_order_items_are_permanent");
	});

	test("a cancelled purchase order frees its reference", () => {
		expect(
			refused(
				db,
				"INSERT INTO purchase_orders (supplier_id, reference) VALUES (1, 'PO-1')",
			),
		).toContain("UNIQUE");
		db.exec(
			"INSERT INTO purchase_orders (supplier_id, reference) VALUES (1, 'R-2'); UPDATE purchase_orders SET status = 'cancelled' WHERE reference = 'R-2'",
		);
		expect(
			refused(
				db,
				"INSERT INTO purchase_orders (supplier_id, reference) VALUES (1, 'R-2')",
			),
		).toBe("accepted");
	});

	test("catalogue rows are archived, never deleted or moved", () => {
		expect(refused(db, "DELETE FROM variants WHERE id = 2")).toContain(
			"variants_are_archived",
		);
		expect(refused(db, "DELETE FROM products WHERE id = 2")).toContain(
			"products_are_archived",
		);
		expect(
			refused(db, "UPDATE variants SET product_id = 2 WHERE id = 1"),
		).toContain("variants_product_locked");
	});

	test("a product is never published, by insert or update, without an active priced variant", () => {
		expect(
			refused(
				db,
				"INSERT INTO products (slug, brand_id, category_id, status) VALUES ('x', 1, 1, 'published')",
			),
		).toContain("published_product_requires_price");
		expect(
			refused(db, "UPDATE products SET status = 'published' WHERE id = 2"),
		).toContain("published_product_requires_price");
		expect(
			refused(db, "UPDATE variants SET status = 'archived' WHERE id = 1"),
		).toContain("published_product_requires_price");
		db.exec("UPDATE variants SET price = 900 WHERE id = 2");
		expect(
			refused(db, "UPDATE products SET status = 'published' WHERE id = 2"),
		).toBe("accepted");
	});

	test("barcodes are GTIN-14 and unique; slugs are lowercase words", () => {
		expect(
			refused(db, "UPDATE variants SET gtin = '8809576261318' WHERE id = 1"),
		).toContain("variants_gtin");
		db.exec("UPDATE variants SET gtin = '08809576261318' WHERE id = 1");
		expect(
			refused(db, "UPDATE variants SET gtin = '08809576261318' WHERE id = 2"),
		).toContain("UNIQUE constraint failed: variants.gtin");
		for (const slug of ["Bad", "a--b", "-a", "a-", "a_b", ""])
			expect(
				refused(
					db,
					`INSERT INTO brands (slug, name, search_key) VALUES ('${slug}', 'X', 'x')`,
				),
			).toContain("brands_slug");
	});

	test("an image's variant belongs to its product and its file never changes", () => {
		const file = (letter: string) =>
			`INSERT INTO media_files (r2_key, content_type, byte_size, width, height) VALUES ('${letter.repeat(64)}.webp', 'image/webp', 10, 800, 800)`;
		db.exec(file("a"));
		db.exec(file("b"));
		db.exec(file("c"));
		db.exec(
			"INSERT INTO product_images (product_id, variant_id, media_file_id, kind) VALUES (1, 1, 1, 'packshot')",
		);
		expect(
			refused(
				db,
				"INSERT INTO product_images (product_id, variant_id, media_file_id, kind) VALUES (1, 2, 2, 'packshot')",
			),
		).toContain("image_variant_mismatch");
		expect(
			refused(db, "UPDATE product_images SET variant_id = 2 WHERE id = 1"),
		).toContain("image_variant_mismatch");
		expect(
			refused(db, "UPDATE product_images SET media_file_id = 3"),
		).toContain("product_images_locked");
		expect(refused(db, "UPDATE product_images SET product_id = 2")).toContain(
			"product_images_locked",
		);
		expect(
			refused(
				db,
				"INSERT INTO product_images (product_id, media_file_id, kind) VALUES (1, 1, 'lifestyle')",
			),
		).toContain(
			"UNIQUE constraint failed: product_images.product_id, product_images.media_file_id",
		);
		expect(
			refused(
				db,
				"INSERT INTO product_images (product_id, media_file_id, kind) VALUES (2, 1, 'lifestyle')",
			),
		).toBe("accepted");
		expect(
			refused(
				db,
				"INSERT INTO product_images (product_id, media_file_id, kind) VALUES (1, 99, 'lifestyle')",
			),
		).toContain("FOREIGN KEY constraint failed");
		expect(
			refused(
				db,
				"UPDATE product_images SET status = 'archived', position = 3, variant_id = NULL",
			),
		).toBe("accepted");
		expect(refused(db, "DELETE FROM product_images")).toContain(
			"product_images_are_archived",
		);
		db.exec("INSERT INTO bundles (slug, price) VALUES ('r', 1)");
		for (const table of ["brands", "categories", "bundles", "suppliers"])
			expect(refused(db, `DELETE FROM ${table}`)).toContain(
				`${table}_are_archived`,
			);
	});

	test("an order without lines is never paid or shipped", () => {
		db.exec(
			"INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, payment_method, shipping_method, confirmation_message, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'Ana', 'ana@example.com', '+50371234567', 'es', 'web', 'card', 'pickup', 'm', 0, 0, 'o-2')",
		);
		expect(refused(db, pay.replace("WHERE id = 1", "WHERE id = 2"))).toContain(
			"order_has_no_lines",
		);
		expect(refused(db, cancel.replace("WHERE id = 1", "WHERE id = 2"))).toBe(
			"accepted",
		);
	});

	test("purchase orders only go to active suppliers; draft notes are never blank", () => {
		db.exec(`
INSERT INTO purchase_orders (supplier_id, reference) VALUES (1, 'D-1');
UPDATE suppliers SET status = 'archived' WHERE id = 1;`);
		expect(
			refused(
				db,
				"INSERT INTO purchase_orders (supplier_id, reference) VALUES (1, 'D-2')",
			),
		).toContain("supplier_archived");
		expect(
			refused(
				db,
				"UPDATE purchase_orders SET status = 'ordered', ordered_on = '2026-10-05' WHERE reference = 'D-1'",
			),
		).toContain("supplier_archived");
		expect(
			refused(
				db,
				"UPDATE purchase_orders SET status = 'cancelled' WHERE reference = 'D-1'",
			),
		).toBe("accepted");
		expect(
			refused(
				db,
				"INSERT INTO purchase_receipts (purchase_order_id, received_on, created_by) VALUES (1, '2026-10-05', 'u')",
			),
		).toBe("accepted");
		db.exec("UPDATE suppliers SET status = 'active' WHERE id = 1");
		expect(
			refused(
				db,
				"INSERT INTO purchase_orders (supplier_id, reference, notes) VALUES (1, 'D-3', '  ')",
			),
		).toContain("purchase_orders_notes");
	});

	test("supplier items: one per supplier and variant, one preferred, archived not deleted", () => {
		db.exec(`
INSERT INTO suppliers (name, lead_time_days, search_key) VALUES ('Other', 10, 'other');
INSERT INTO supplier_items (supplier_id, variant_id, pack_size, min_order_quantity, is_preferred) VALUES (1, 1, 6, 12, 1);`);
		expect(
			refused(db, "UPDATE suppliers SET lead_time_days = -1 WHERE id = 1"),
		).toContain("suppliers_lead_time");
		expect(
			refused(
				db,
				"INSERT INTO supplier_items (supplier_id, variant_id) VALUES (1, 1)",
			),
		).toContain("UNIQUE constraint failed: supplier_items.supplier_id");
		expect(
			refused(
				db,
				"INSERT INTO supplier_items (supplier_id, variant_id, is_preferred) VALUES (2, 1, 1)",
			),
		).toContain("UNIQUE constraint failed: supplier_items.variant_id");
		expect(
			refused(
				db,
				"INSERT INTO supplier_items (supplier_id, variant_id, pack_size) VALUES (2, 2, 0)",
			),
		).toContain("supplier_items_quantities");
		expect(
			refused(
				db,
				"INSERT INTO supplier_items (supplier_id, variant_id, supplier_sku) VALUES (2, 2, ' ')",
			),
		).toContain("supplier_items_sku");
		expect(
			refused(db, "UPDATE supplier_items SET variant_id = 2 WHERE id = 1"),
		).toContain("supplier_items_identity_locked");
		expect(refused(db, "DELETE FROM supplier_items WHERE id = 1")).toContain(
			"supplier_items_are_archived",
		);
		db.exec("UPDATE supplier_items SET status = 'archived' WHERE id = 1");
		expect(
			refused(
				db,
				"INSERT INTO supplier_items (supplier_id, variant_id, is_preferred) VALUES (2, 1, 1)",
			),
		).toBe("accepted");
		db.exec("UPDATE suppliers SET status = 'archived' WHERE id = 2");
		expect(
			refused(
				db,
				"INSERT INTO supplier_items (supplier_id, variant_id) VALUES (2, 2)",
			),
		).toContain("supplier_archived");
	});

	test("a consent points at the page of its purpose", () => {
		const consent = (purpose: string, version: number) =>
			`INSERT INTO customer_consents (order_id, purpose, granted, page_version_id, channel) VALUES (1, '${purpose}', 1, ${version}, 'web')`;
		expect(refused(db, consent("terms", 1))).toContain("consent_page_mismatch");
		expect(refused(db, consent("privacy_notice", 2))).toContain(
			"consent_page_mismatch",
		);
		expect(refused(db, consent("marketing_whatsapp", 2))).toContain(
			"consent_page_mismatch",
		);
		expect(refused(db, consent("terms", 2))).toBe("accepted");
		expect(refused(db, consent("privacy_notice", 1))).toBe("accepted");
		expect(refused(db, consent("marketing_whatsapp", 1))).toBe("accepted");
		expect(refused(db, consent("marketing_email", 1))).toBe("accepted");
		expect(refused(db, consent("marketing_sms", 1))).toContain(
			"CHECK constraint failed: customer_consents_purpose",
		);
	});

	test("page versions are append-only; a consent only gains its customer", () => {
		expect(refused(db, "UPDATE page_versions SET title = 'x'")).toContain(
			"page_versions_append_only",
		);
		db.exec(`
INSERT INTO customers (name, phone_e164, search_key) VALUES ('Ana', '+50371234567', 'ana 50371234567');
INSERT INTO customer_consents (order_id, purpose, granted, page_version_id, channel) VALUES (1, 'privacy_notice', 1, 1, 'web');`);
		expect(
			refused(db, "UPDATE customer_consents SET granted = 0 WHERE id = 1"),
		).toContain("customer_consents_append_only");
		expect(
			refused(db, "UPDATE customer_consents SET customer_id = 1 WHERE id = 1"),
		).toBe("accepted");
		expect(
			refused(
				db,
				"UPDATE customer_consents SET customer_id = NULL WHERE id = 1",
			),
		).toContain("customer_consents_append_only");
	});
});

describe("collections, slides, media files and promotions", () => {
	let db: Database;
	const KEY = `${"a".repeat(64)}.webp`;
	beforeEach(() => {
		db = migrated();
		db.exec(`
INSERT INTO brands (slug, name, search_key) VALUES ('b', 'Brand', 'brand b');
INSERT INTO categories (slug, icon, sort_order) VALUES ('c', 'package', 1);
INSERT INTO products (slug, brand_id, category_id) VALUES ('p', 1, 1);
INSERT INTO products (slug, brand_id, category_id, status) VALUES ('old', 1, 1, 'archived');
INSERT INTO media_files (r2_key, content_type, byte_size, width, height) VALUES ('${KEY}', 'image/webp', 10, 100, 50);
INSERT INTO collections (slug) VALUES ('essentials');
INSERT INTO home_slides (desktop_media_id, link_path) VALUES (1, '/products');
INSERT INTO promotions (code, type, value, min_subtotal, usage_limit, status) VALUES ('HOLA10', 'percentage', 10, 3000, 1, 'active');
INSERT INTO promotions (code, type, value, per_customer_limit, status) VALUES ('CINCO', 'fixed', 500, 1, 'active');
INSERT INTO customers (name, phone_e164, search_key) VALUES ('Ana', '+50371234567', 'ana');
`);
	});
	const quoted = (v: string | number | undefined) =>
		v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${v}'`;
	const order = (
		n: number,
		f: {
			promotion?: number;
			subtotal: number;
			discount?: number;
			reason?: string;
			email?: string;
			phone?: string;
			customer?: number;
			channel?: string;
		},
	) =>
		`INSERT INTO orders (code, idempotency_key, request_hash, customer_name, customer_email, customer_phone, locale, channel, payment_method, shipping_method, confirmation_message, subtotal, discount, discount_reason, total, search_key, promotion_id, customer_id) VALUES ('O-${n}', 'k${n}', 'h', 'Ana', '${f.email ?? `cliente${n}@example.com`}', '${f.phone ?? "+50371234567"}', 'es', '${f.channel ?? "web"}', 'card', 'pickup', 'm', ${f.subtotal}, ${f.discount ?? 0}, ${quoted(f.reason)}, ${f.subtotal - (f.discount ?? 0)}, 'o', ${quoted(f.promotion)}, ${quoted(f.customer)})`;
	const redeem = (
		n: number,
		promotion: number,
		email = `cliente${n}@example.com`,
		key: string | null = null,
	) =>
		`INSERT INTO promotion_redemptions (promotion_id, order_id, email, customer_key) VALUES (${promotion}, (SELECT id FROM orders WHERE code = 'O-${n}'), '${email}', ${key === null ? "NULL" : `'${key}'`})`;
	// HOLA10: 10% from 30.00, once in total.
	const hola = (n: number, subtotal = 4100) =>
		order(n, {
			promotion: 1,
			subtotal,
			discount: Math.floor((subtotal * 10 + 50) / 100),
			reason: "HOLA10",
		});
	// CINCO: 5.00 off, once per customer email.
	const cinco = (n: number, email: string) =>
		order(n, {
			promotion: 2,
			subtotal: 1700,
			discount: 500,
			reason: "CINCO",
			email,
		});
	const cancel = (n: number) =>
		`UPDATE orders SET status = 'cancelled', cancelled_at = '2026-10-15T00:00:00Z' WHERE code = 'O-${n}'`;

	test("a media file never changes or goes, and its key is a content key", () => {
		expect(refused(db, "UPDATE media_files SET width = 1")).toContain(
			"media_files_are_permanent",
		);
		expect(refused(db, "DELETE FROM media_files")).toContain(
			"media_files_are_permanent",
		);
		for (const key of [
			"photo.webp",
			`${"A".repeat(64)}.webp`,
			`${"a".repeat(64)}.gif`,
		])
			expect(
				refused(
					db,
					`INSERT INTO media_files (r2_key, content_type, byte_size, width, height) VALUES ('${key}', 'image/webp', 1, 1, 1)`,
				),
			).toContain("media_files_key");
	});

	test("collections, slides and promotions are archived, never deleted", () => {
		expect(refused(db, "DELETE FROM collections")).toContain(
			"collections_are_archived",
		);
		expect(refused(db, "DELETE FROM home_slides")).toContain(
			"home_slides_are_archived",
		);
		expect(refused(db, "DELETE FROM promotions")).toContain(
			"promotions_are_archived",
		);
	});

	test("a collection holds products that are not archived, in positions from 1", () => {
		const add = (product: number, position: number) =>
			`INSERT INTO collection_products (collection_id, product_id, position) VALUES (1, ${product}, ${position})`;
		expect(refused(db, add(2, 1))).toContain("collection_product_archived");
		expect(refused(db, add(1, 0))).toContain(
			"collection_products_position_positive",
		);
		expect(refused(db, add(1, 1))).toBe("accepted");
	});

	test("a slide links inside the store, between ordered dates", () => {
		const slide = (link: string, dates = "NULL, NULL") =>
			`INSERT INTO home_slides (desktop_media_id, link_path, starts_on, ends_on) VALUES (1, '${link}', ${dates})`;
		for (const link of [
			"https://example.com",
			"//example.com",
			"products",
			"/a b",
			"/a\\b",
			"/protección",
		])
			expect(refused(db, slide(link))).toContain("home_slides_link_path");
		expect(
			refused(db, slide("/products", "'2026-11-02', '2026-11-01'")),
		).toContain("home_slides_dates");
		expect(
			refused(
				db,
				slide("/products?category=iluminacion", "'2026-11-01', '2026-11-01'"),
			),
		).toBe("accepted");
	});

	test("codes are capitals; a percentage is 1 to 50, a fixed amount positive; a code starts before it ends", () => {
		const promotion = (code: string, type: string, value: number, extra = "") =>
			`INSERT INTO promotions (code, type, value${extra ? ", starts_on, ends_on" : ""}) VALUES ('${code}', '${type}', ${value}${extra})`;
		expect(refused(db, promotion("hola", "percentage", 10))).toContain(
			"promotions_code",
		);
		expect(refused(db, promotion("A B C", "percentage", 10))).toContain(
			"promotions_code",
		);
		expect(refused(db, promotion("DOBLE", "percentage", 51))).toContain(
			"promotions_value",
		);
		expect(refused(db, promotion("MITAD", "percentage", 50))).toBe("accepted");
		expect(refused(db, promotion("NADA", "fixed", 0))).toContain(
			"promotions_value",
		);
		expect(refused(db, promotion("HOLA10", "fixed", 100))).toContain(
			"UNIQUE constraint failed: promotions.code",
		);
		expect(
			refused(
				db,
				promotion("UNDIA", "fixed", 100, ", '2026-12-01', '2026-12-01'"),
			),
		).toContain("promotions_dates");
		expect(
			refused(
				db,
				promotion("DOSDIAS", "fixed", 100, ", '2026-12-01', '2026-12-02'"),
			),
		).toBe("accepted");
		expect(
			refused(
				db,
				"INSERT INTO promotions (code, type, value, per_customer_limit) VALUES ('DOSVECES', 'fixed', 100, 2)",
			),
		).toContain("promotions_limits");
		expect(refused(db, promotion("BIEN-VENIDA_2", "fixed", 250))).toBe(
			"accepted",
		);
	});

	test("an order placed with a code gets exactly the code's discount, and no code no discount", () => {
		for (const wrong of [
			order(1, {
				promotion: 1,
				subtotal: 4100,
				discount: 400,
				reason: "HOLA10",
			}),
			order(1, { promotion: 1, subtotal: 4100, discount: 410, reason: "OTRO" }),
			hola(1, 2999),
			order(1, { subtotal: 4100, discount: 410, reason: "Amigo" }),
		])
			expect(refused(db, wrong)).toContain("promotion_discount_mismatch");
		expect(
			refused(
				db,
				order(1, {
					promotion: 2,
					subtotal: 300,
					discount: 500,
					reason: "CINCO",
				}),
			),
		).toMatch(/promotion_discount_mismatch|orders_amounts_non_negative/);
		expect(refused(db, hola(1, 4105))).toBe("accepted");
		expect(
			db.query("select discount from orders where code = 'O-1'").get(),
		).toEqual({ discount: 411 });
		expect(
			refused(
				db,
				order(2, {
					promotion: 2,
					subtotal: 300,
					discount: 300,
					reason: "CINCO",
				}),
			),
		).toBe("accepted");
	});

	test("a redemption belongs to its pending order, with the order's email", () => {
		db.exec(hola(1));
		expect(refused(db, redeem(1, 1, "otra@example.com"))).toContain(
			"promotion_redemption_mismatch",
		);
		expect(refused(db, redeem(1, 2))).toContain(
			"promotion_redemption_mismatch",
		);
		expect(
			refused(db, redeem(1, 1, "cliente1@example.com", "cliente1@example.com")),
		).toContain("promotion_redemption_mismatch");
		expect(refused(db, redeem(1, 1))).toBe("accepted");
		expect(refused(db, redeem(1, 1))).not.toBe("accepted");
		expect(refused(db, "DELETE FROM promotion_redemptions")).toContain(
			"promotion_redemptions_are_permanent",
		);
	});

	test("the usage limit holds in the database; a cancelled order releases its use", () => {
		db.exec(hola(1));
		expect(refused(db, redeem(1, 1))).toBe("accepted");
		db.exec(hola(2));
		expect(refused(db, redeem(2, 1))).toContain("promotion_usage_limit");
		db.exec(cancel(1));
		expect(
			db
				.query(
					"select released_at from promotion_redemptions where order_id = 1",
				)
				.get(),
		).toEqual({ released_at: "2026-10-15T00:00:00Z" });
		expect(refused(db, redeem(2, 1))).toBe("accepted");
		expect(
			refused(
				db,
				"UPDATE promotion_redemptions SET released_at = NULL WHERE order_id = 1",
			),
		).toContain("promotion_redemptions_locked");
	});

	test("a code once per customer is refused for a second order of the same email until the first is cancelled", () => {
		const key = (email: string) => email;
		db.exec(cinco(1, "ana@example.com"));
		expect(refused(db, redeem(1, 2, "ana@example.com"))).toContain(
			"promotion_redemption_mismatch",
		);
		expect(
			refused(db, redeem(1, 2, "ana@example.com", key("ana@example.com"))),
		).toBe("accepted");
		db.exec(cinco(2, "ana@example.com"));
		expect(
			refused(db, redeem(2, 2, "ana@example.com", "ana@example.com")),
		).toContain(
			"UNIQUE constraint failed: promotion_redemptions.promotion_id, promotion_redemptions.customer_key",
		);
		db.exec(cinco(3, "beto@example.com"));
		expect(
			refused(db, redeem(3, 2, "beto@example.com", "beto@example.com")),
		).toBe("accepted");
		db.exec(cancel(1));
		expect(
			refused(db, redeem(2, 2, "ana@example.com", "ana@example.com")),
		).toBe("accepted");
	});

	test("a first-purchase code is only for an email without an order that was not cancelled", () => {
		db.exec(
			"INSERT INTO promotions (code, type, value, first_order_only, status) VALUES ('PRIMERA', 'percentage', 10, 1, 'active')",
		);
		const primera = (n: number, email: string) =>
			order(n, {
				promotion: 3,
				subtotal: 1000,
				discount: 100,
				reason: "PRIMERA",
				email,
			});
		db.exec(primera(1, "ana@example.com"));
		expect(refused(db, redeem(1, 3, "ana@example.com"))).toBe("accepted");
		db.exec(primera(2, "ana@example.com"));
		expect(refused(db, redeem(2, 3, "ana@example.com"))).toContain(
			"promotion_first_order_only",
		);
		db.exec(cancel(1));
		expect(refused(db, redeem(2, 3, "ana@example.com"))).toBe("accepted");
	});

	test("an inactive code is refused", () => {
		db.exec("UPDATE promotions SET status = 'inactive' WHERE id = 1");
		db.exec(hola(1));
		expect(refused(db, redeem(1, 1))).toContain("promotion_inactive");
	});

	test("a code's terms are fixed once used; dates, limits and status are not", () => {
		expect(refused(db, "UPDATE promotions SET value = 20 WHERE id = 2")).toBe(
			"accepted",
		);
		db.exec(hola(1));
		db.exec(redeem(1, 1));
		for (const change of [
			"code = 'HOLA20'",
			"type = 'fixed'",
			"value = 20",
			"min_subtotal = 1",
			"first_order_only = 1",
			"per_customer_limit = 1",
		])
			expect(
				refused(db, `UPDATE promotions SET ${change} WHERE id = 1`),
			).toContain("promotion_terms_locked");
		expect(
			refused(
				db,
				"UPDATE promotions SET usage_limit = 5, ends_on = '2026-12-31', status = 'inactive' WHERE id = 1",
			),
		).toBe("accepted");
	});

	test("an order keeps its code and its discount", () => {
		db.exec(hola(1));
		for (const change of [
			"promotion_id = NULL",
			"discount = 0, total = subtotal",
			"discount_reason = 'OTRO'",
		])
			expect(refused(db, `UPDATE orders SET ${change} WHERE id = 1`)).toContain(
				"order_terms_locked",
			);
	});

	test("the phone given with an order is Salvadoran and never changes", () => {
		for (const phone of [
			"71234567",
			"+5037123456a",
			"+0123456789",
			"+5031",
			"+12025550123",
		])
			expect(refused(db, order(1, { subtotal: 100, phone }))).toContain(
				"CHECK constraint failed: orders_customer_phone",
			);
		expect(
			refused(db, order(1, { subtotal: 100, phone: "+50371234567" })),
		).toBe("accepted");
		expect(
			refused(db, "UPDATE orders SET customer_phone = '+50370000000'"),
		).toContain("order_identity_locked");
	});

	test("what the store does not have is refused", () => {
		expect(
			refused(db, order(1, { subtotal: 100, channel: "telegram" })),
		).toContain("CHECK constraint failed: orders_channel");
		expect(
			refused(db, order(1, { subtotal: 100, email: "Ana@Example.com" })),
		).toContain("CHECK constraint failed: orders_customer_email");
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) VALUES (1, 'count', 1, 'u')",
			),
		).toContain("CHECK constraint failed: inventory_movements_kind");
	});
});
