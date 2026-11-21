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
			"lots_expiry_locked",
			"customer_consents_page_matches_purpose",
			"purchase_orders_active_supplier_insert",
			"supplier_items_no_delete",
			"supplier_items_identity_locked",
			"media_files_locked",
			"promotions_terms_locked",
			"orders_promotion_usage_limit",
			"orders_promotion_customer_limit",
			"orders_promotion_discount_insert",
			"orders_promotion_discount_update",
			"orders_confirm_within_stock",
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
INSERT INTO categories (slug, routine_step) VALUES ('c', 1);
INSERT INTO products (slug, brand_id, category_id) VALUES ('p', 1, 1);
INSERT INTO variants (product_id, sku, price, search_key) VALUES (1, 'SKU-1', 1700, 'sku-1');
UPDATE products SET status = 'published' WHERE id = 1;
INSERT INTO products (slug, brand_id, category_id) VALUES ('d', 1, 1);
INSERT INTO variants (product_id, sku, search_key) VALUES (2, 'SKU-2', 'sku-2');
INSERT INTO suppliers (name, search_key) VALUES ('Supplier', 'supplier');
INSERT INTO purchase_orders (supplier_id, reference, status, ordered_on) VALUES (1, 'PO-1', 'ordered', '2026-10-01');
INSERT INTO purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) VALUES (1, 1, 4, 700);
INSERT INTO purchase_receipts (purchase_order_id, received_on, created_by) VALUES (1, '2026-10-05', 'u');
INSERT INTO purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) VALUES (1, 1, 2, 0);
INSERT INTO lots (variant_id, receipt_line_id, expires_on, unit_cost_e4) VALUES (1, 1, '2027-01-31', 70000);
INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) VALUES (1, 'receive', 2, 'u');
INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key) VALUES ('O-1', 'k1', 'h', 'es', 'whatsapp', 1700, 1700, 'o-1');
INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (1, 1, 1, 1700, 'SKU-1', 'Brand', 'Name');
INSERT INTO pages (slug, is_published) VALUES ('privacy', 1);
INSERT INTO page_versions (page_id, locale, version, title, body_markdown) VALUES (1, 'es', 1, 'Aviso', 'Texto');
INSERT INTO pages (slug, is_published) VALUES ('terms', 1);
INSERT INTO page_versions (page_id, locale, version, title, body_markdown) VALUES (2, 'es', 1, 'Términos', 'Texto');
`);
	});
	const confirm = `UPDATE orders SET status = 'confirmed', confirmed_at = '2026-10-05T00:00:00Z', payment_method = 'cash', shipping_method = 'pickup', delivery_estimate_from = '2026-10-06', delivery_estimate_to = '2026-10-06', confirmation_message = 'm' WHERE id = 1`;

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

	test("an order starts pending and keeps its identity", () => {
		expect(
			refused(
				db,
				"INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, status, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'es', 'instagram', 'confirmed', 0, 0, 'o-2')",
			),
		).toContain("order_must_start_pending");
		expect(
			refused(db, "UPDATE orders SET code = 'X', locale = 'en'"),
		).toContain("order_identity_locked");
	});

	test("lines of a pending order can change, and must add up on confirmation", () => {
		expect(
			refused(db, "UPDATE order_items SET quantity = 2 WHERE id = 1"),
		).toBe("accepted");
		expect(refused(db, confirm)).toContain("order_subtotal_mismatch");
		db.exec(
			"UPDATE orders SET subtotal = 3400, total = 3400 WHERE id = 1; UPDATE order_items SET quantity = 1 WHERE id = 1; UPDATE orders SET subtotal = 1700, total = 1700 WHERE id = 1",
		);
		expect(refused(db, confirm)).toBe("accepted");
		expect(refused(db, "DELETE FROM order_items WHERE id = 1")).toContain(
			"order_items_are_permanent",
		);
	});

	test("a pending order's line can be deleted", () => {
		expect(refused(db, "DELETE FROM order_items WHERE id = 1")).toBe(
			"accepted",
		);
	});

	test("confirmed terms, address and names are fixed; timestamps are write-once", () => {
		db.exec(confirm);
		for (const change of [
			"ship_to = 'elsewhere'",
			"shipping_zone_name = 'Z'",
			"discount_reason = 'x'",
			"customer_name = 'Other'",
			"shipping = 300, total = 2000",
		])
			expect(refused(db, `UPDATE orders SET ${change} WHERE id = 1`)).toContain(
				"order_terms_locked",
			);
		expect(
			refused(
				db,
				"UPDATE orders SET fulfilled_at = '2026-01-01T00:00:00Z' WHERE id = 1",
			),
		).toContain("order_timestamps_locked");
		db.exec(
			"INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'sale', -1, 1, 'u')",
		);
		db.exec(
			"UPDATE orders SET status = 'fulfilled', fulfilled_at = '2026-10-05T01:00:00Z' WHERE id = 1",
		);
		expect(
			refused(
				db,
				"UPDATE orders SET fulfilled_at = '1999-01-01T00:00:00Z' WHERE id = 1",
			),
		).toContain("order_timestamps_locked");
	});

	test("concurrent fulfils are refused by the sale triggers", () => {
		db.exec(confirm);
		db.exec(
			"INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'sale', -1, 1, 'u')",
		);
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'sale', -1, 1, 'u')",
			),
		).toContain("sale_exceeds_order_line");
	});

	test("return movements follow their return line", () => {
		db.exec(confirm);
		db.exec(`
INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_by) VALUES (1, 'sale', -1, 1, 'u');
UPDATE orders SET status = 'fulfilled', fulfilled_at = '2026-10-05T01:00:00Z' WHERE id = 1;
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
		expect(
			refused(
				db,
				"INSERT INTO payments (order_id, kind, method, amount, status, return_id, recorded_by) VALUES (1, 'payment', 'cash', 1700, 'confirmed', NULL, 'u')",
			),
		).toBe("accepted");
		db.exec(
			"INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'es', 'instagram', 0, 0, 'o-2')",
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

	test("an image's size belongs to its product and its file never changes", () => {
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
		db.exec(
			"INSERT INTO concerns (slug) VALUES ('c'); INSERT INTO routines (slug) VALUES ('r')",
		);
		for (const table of [
			"brands",
			"categories",
			"concerns",
			"routines",
			"suppliers",
		])
			expect(refused(db, `DELETE FROM ${table}`)).toContain(
				`${table}_are_archived`,
			);
	});

	test("a lot's expiry is fixed once anything but its receipt moved it", () => {
		expect(
			refused(
				db,
				"UPDATE lots SET expires_on = '2027-02-28', expiry_precision = 'month' WHERE id = 1",
			),
		).toBe("accepted");
		db.exec(
			"INSERT INTO inventory_movements (lot_id, kind, quantity, reason, created_by) VALUES (1, 'waste', -1, 'damaged', 'u')",
		);
		expect(
			refused(
				db,
				"UPDATE lots SET expires_on = '2027-03-01', expiry_precision = 'day' WHERE id = 1",
			),
		).toContain("lot_expiry_locked");
		expect(
			refused(db, "UPDATE lots SET expiry_precision = 'day' WHERE id = 1"),
		).toContain("lot_expiry_locked");
		expect(refused(db, "UPDATE lots SET code = 'L-1' WHERE id = 1")).toBe(
			"accepted",
		);
	});

	test("an order is confirmed only while its units fit in its lots", () => {
		// The lot holds 2 units; O-1 wants 1 and O-2 wants 2.
		db.exec(`
INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key) VALUES ('O-2', 'k2', 'h', 'es', 'whatsapp', 3400, 3400, 'o-2');
INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (2, 1, 2, 1700, 'SKU-1', 'Brand', 'Name');
`);
		const confirmSecond = confirm.replace("WHERE id = 1", "WHERE id = 2");
		expect(refused(db, confirm)).toBe("accepted");
		expect(refused(db, confirmSecond)).toContain("order_exceeds_stock");
		db.exec(
			"UPDATE orders SET status = 'cancelled', cancelled_at = '2026-10-05T00:00:00Z' WHERE id = 1",
		);
		expect(refused(db, confirmSecond)).toBe("accepted");
	});

	test("an order without lines is never confirmed or fulfilled", () => {
		db.exec("DELETE FROM order_items WHERE id = 1");
		db.exec("UPDATE orders SET subtotal = 0, total = 0 WHERE id = 1");
		expect(refused(db, confirm)).toContain("order_has_no_lines");
		expect(
			refused(
				db,
				"UPDATE orders SET status = 'cancelled', cancelled_at = '2026-10-05T00:00:00Z' WHERE id = 1",
			),
		).toBe("accepted");
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
		expect(refused(db, consent("marketing_email", 1))).toContain(
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
INSERT INTO categories (slug, routine_step) VALUES ('c', 1);
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
			phone?: string;
			customer?: number;
		},
	) =>
		`INSERT INTO orders (code, idempotency_key, request_hash, locale, channel, subtotal, discount, discount_reason, total, search_key, promotion_id, customer_phone, customer_id) VALUES ('O-${n}', 'k${n}', 'h', 'es', 'whatsapp', ${f.subtotal}, ${f.discount ?? 0}, ${quoted(f.reason)}, ${f.subtotal - (f.discount ?? 0)}, 'o', ${quoted(f.promotion)}, ${quoted(f.phone)}, ${quoted(f.customer)})`;
	// HOLA10: 10% from 30.00, once in total.
	const hola = (n: number, subtotal = 4100) =>
		order(n, {
			promotion: 1,
			subtotal,
			discount: Math.floor((subtotal * 10 + 50) / 100),
			reason: "HOLA10",
		});
	// CINCO: 5.00 off, once per customer.
	const cinco = (n: number, extra: { phone?: string; customer?: number }) =>
		order(n, {
			promotion: 2,
			subtotal: 1700,
			discount: 500,
			reason: "CINCO",
			...extra,
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
				slide("/products?category=sunscreen", "'2026-11-01', '2026-11-01'"),
			),
		).toBe("accepted");
	});

	test("codes are capitals; a percentage is 1 to 100, a fixed amount positive", () => {
		const promotion = (code: string, type: string, value: number) =>
			`INSERT INTO promotions (code, type, value) VALUES ('${code}', '${type}', ${value})`;
		expect(refused(db, promotion("hola", "percentage", 10))).toContain(
			"promotions_code",
		);
		expect(refused(db, promotion("A B C", "percentage", 10))).toContain(
			"promotions_code",
		);
		expect(refused(db, promotion("DOBLE", "percentage", 101))).toContain(
			"promotions_value",
		);
		expect(refused(db, promotion("NADA", "fixed", 0))).toContain(
			"promotions_value",
		);
		expect(refused(db, promotion("HOLA10", "fixed", 100))).toContain(
			"UNIQUE constraint failed: promotions.code",
		);
		expect(refused(db, promotion("BIEN-VENIDA_2", "fixed", 250))).toBe(
			"accepted",
		);
	});

	test("an order placed with a code gets exactly the code's discount", () => {
		for (const wrong of [
			order(1, {
				promotion: 1,
				subtotal: 4100,
				discount: 400,
				reason: "HOLA10",
			}),
			order(1, { promotion: 1, subtotal: 4100, discount: 410, reason: "OTRO" }),
			// Below the minimum subtotal.
			hola(1, 2999),
		])
			expect(refused(db, wrong)).toContain("promotion_discount_mismatch");
		// A fixed amount is never more than the subtotal.
		expect(
			refused(
				db,
				order(1, {
					promotion: 2,
					subtotal: 300,
					discount: 500,
					reason: "CINCO",
					phone: "+50370000001",
				}),
			),
		).toMatch(/promotion_discount_mismatch|orders_amounts_non_negative/);
		// 4105 x 10% = 410.5, rounded half up.
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
					phone: "+50370000001",
				}),
			),
		).toBe("accepted");
	});

	test("the usage limit holds in the database; a cancelled order frees its use", () => {
		expect(refused(db, hola(1))).toBe("accepted");
		expect(refused(db, hola(2))).toContain("promotion_usage_limit");
		// A concurrent retry of the order that used it is left to its ON CONFLICT.
		expect(
			refused(db, `${hola(1)} ON CONFLICT (idempotency_key) DO NOTHING`),
		).toBe("accepted");
		db.exec(cancel(1));
		expect(refused(db, hola(2))).toBe("accepted");
	});

	test("the limit per customer needs a phone and counts it, also through the linked customer", () => {
		expect(refused(db, cinco(1, {}))).toContain("promotion_customer_limit");
		expect(refused(db, cinco(1, { phone: "+50370000001" }))).toBe("accepted");
		expect(refused(db, cinco(2, { phone: "+50370000001" }))).toContain(
			"promotion_customer_limit",
		);
		expect(refused(db, cinco(2, { phone: "+50370000002" }))).toBe("accepted");
		// Placed with another phone, then linked to Ana (+50371234567).
		expect(refused(db, cinco(3, { phone: "+50370000003", customer: 1 }))).toBe(
			"accepted",
		);
		expect(refused(db, cinco(4, { phone: "+50371234567" }))).toContain(
			"promotion_customer_limit",
		);
	});

	test("an inactive code is refused", () => {
		db.exec("UPDATE promotions SET status = 'inactive' WHERE id = 1");
		expect(refused(db, hola(1))).toContain("promotion_inactive");
	});

	test("a code's terms are fixed once used; dates, limits and status are not", () => {
		expect(refused(db, "UPDATE promotions SET value = 20 WHERE id = 2")).toBe(
			"accepted",
		);
		db.exec(hola(1));
		for (const change of [
			"code = 'HOLA20'",
			"type = 'fixed'",
			"value = 20",
			"min_subtotal = 1",
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

	test("a pending order's discount follows its code, which may only be dropped", () => {
		db.exec(hola(1));
		const update = (set: string) =>
			refused(db, `UPDATE orders SET ${set} WHERE id = 1`);
		expect(update("subtotal = 5000, discount = 500, total = 4500")).toBe(
			"accepted",
		);
		expect(update("subtotal = 6000, discount = 500, total = 5500")).toContain(
			"promotion_discount_mismatch",
		);
		expect(update("subtotal = 2000, discount = 200, total = 1800")).toContain(
			"promotion_discount_mismatch",
		);
		expect(update("promotion_id = NULL")).toContain(
			"promotion_discount_mismatch",
		);
		expect(
			update(
				"promotion_id = NULL, discount = 0, discount_reason = NULL, total = subtotal",
			),
		).toBe("accepted");
		expect(update("promotion_id = 1")).toContain("order_promotion_locked");
	});

	test("an order out of pending keeps its code", () => {
		db.exec(hola(1));
		db.exec(cancel(1));
		expect(
			refused(db, "UPDATE orders SET promotion_id = NULL WHERE id = 1"),
		).toContain("order_promotion_locked");
	});

	test("the phone given with an order is E.164 and never changes", () => {
		for (const phone of ["71234567", "+5037123456a", "+0123456789", "+5031"])
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

	test("what the store no longer has is refused", () => {
		// A storefront order is a WhatsApp order; the web is only where a consent was given.
		expect(
			refused(db, order(1, { subtotal: 100 }).replace("'whatsapp'", "'web'")),
		).toContain("CHECK constraint failed: orders_channel");
		expect(
			refused(
				db,
				"INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) VALUES (1, 'count', 1, 'u')",
			),
		).toContain("CHECK constraint failed: inventory_movements_kind");
	});
});
