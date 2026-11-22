import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { migratedDatabase, orderSql } from "./test-database";

const refused = (db: Database, sql: string) => {
	try {
		db.exec(sql);
	} catch (e) {
		return (e as Error).message;
	}
	return "accepted";
};

const rows = <T>(db: Database, sql: string) => db.query(sql).all() as T[];

let db: Database;

const catalogue = (db: Database) =>
	db.exec(`
		INSERT INTO brands (id, slug, name, search_key) VALUES (1, 'akko', 'Akko', 'akko');
		INSERT INTO categories (id, slug, icon, sort_order) VALUES (1, 'teclados', 'keyboard', 1);
		INSERT INTO products (id, slug, brand_id, category_id, warranty_months) VALUES
			(1, 'sakura', 1, 1, 12), (2, 'kuro', 1, 1, 12), (3, 'tsuki', 1, 1, 6);
		INSERT INTO variants (id, product_id, sku, search_key, price, updated_by) VALUES
			(1, 1, 'TEC-002', 'tec-002', 7499, 'admin-1'),
			(2, 2, 'TEC-003', 'tec-003', 5499, NULL),
			(3, 3, 'TEC-004', 'tec-004', 2999, NULL);
		UPDATE products SET status = 'published';
		INSERT INTO bundles (id, slug, price) VALUES (1, 'set-kuro', 12000);
	`);

describe("catalogue rules", () => {
	beforeEach(() => {
		db = migratedDatabase();
		catalogue(db);
	});

	test("a SKU is three capitals, a dash and three digits, and unique", () => {
		for (const sku of ["tec-001", "TEC-01", "TECL-001", "TEC_001", "TEC-0011"])
			expect(
				refused(
					db,
					`INSERT INTO variants (product_id, sku, search_key, price) VALUES (1, '${sku}', 'x', 100)`,
				),
			).toContain("variants_sku_format");
		expect(
			refused(
				db,
				"INSERT INTO variants (product_id, sku, search_key, price) VALUES (1, 'TEC-002', 'x', 100)",
			),
		).toContain("UNIQUE");
	});

	test("a category icon comes from the allow-list and warranty is never negative", () => {
		expect(
			refused(
				db,
				"INSERT INTO categories (slug, icon) VALUES ('sillas', 'armchair')",
			),
		).toContain("categories_icon");
		expect(refused(db, "UPDATE products SET warranty_months = -1")).toContain(
			"products_warranty_months",
		);
	});

	test("every price a variant takes is recorded with who set it, and the history is permanent", () => {
		db.exec(
			"UPDATE variants SET price = 6999, updated_by = 'admin-2' WHERE id = 1",
		);
		db.exec("UPDATE variants SET status = 'active' WHERE id = 1");
		expect(
			rows(
				db,
				"SELECT old_price, new_price, changed_by FROM price_history WHERE variant_id = 1 ORDER BY id",
			),
		).toEqual([
			{ old_price: null, new_price: 7499, changed_by: "admin-1" },
			{ old_price: 7499, new_price: 6999, changed_by: "admin-2" },
		]);
		expect(refused(db, "UPDATE price_history SET new_price = 1")).toContain(
			"price_history_append_only",
		);
		expect(refused(db, "DELETE FROM price_history")).toContain(
			"price_history_append_only",
		);
	});
});

describe("bundle rules", () => {
	beforeEach(() => {
		db = migratedDatabase();
		catalogue(db);
	});

	test("a bundle is created as a draft and is published with at least two items", () => {
		expect(
			refused(
				db,
				"INSERT INTO bundles (slug, price, status) VALUES ('x', 100, 'published')",
			),
		).toContain("bundle_requires_two_items");
		db.exec(
			"INSERT INTO bundle_items (bundle_id, variant_id, position) VALUES (1, 1, 1)",
		);
		expect(
			refused(
				db,
				"UPDATE bundles SET status = 'published', price = 100 WHERE id = 1",
			),
		).toContain("bundle_requires_two_items");
		expect(
			refused(
				db,
				"INSERT INTO bundle_items (bundle_id, variant_id, position) VALUES (1, 1, 2)",
			),
		).toContain("UNIQUE");
	});

	test("a published bundle costs less than its items at their current prices", () => {
		db.exec(
			"INSERT INTO bundle_items (bundle_id, variant_id, position) VALUES (1, 1, 1), (1, 2, 2)",
		);
		db.exec("UPDATE bundles SET price = 12998 WHERE id = 1");
		expect(
			refused(db, "UPDATE bundles SET status = 'published' WHERE id = 1"),
		).toContain("bundle_price_not_below_items");
		db.exec(
			"UPDATE bundles SET price = 12000, status = 'published' WHERE id = 1",
		);
		expect(
			refused(db, "UPDATE bundles SET price = 13000 WHERE id = 1"),
		).toContain("bundle_price_not_below_items");
		expect(
			refused(
				db,
				"UPDATE bundle_items SET quantity = 1, variant_id = 3 WHERE bundle_id = 1 AND variant_id = 2",
			),
		).toContain("bundle_price_not_below_items");
		expect(
			refused(
				db,
				"DELETE FROM bundle_items WHERE bundle_id = 1 AND variant_id = 2",
			),
		).toContain("bundle_price_not_below_items");
		expect(
			refused(
				db,
				"INSERT INTO bundle_items (bundle_id, variant_id, quantity, position) VALUES (1, 3, 2, 3)",
			),
		).toBe("accepted");
		expect(
			refused(
				db,
				"DELETE FROM bundle_items WHERE bundle_id = 1 AND variant_id = 2",
			),
		).toBe("accepted");
		db.exec("UPDATE bundles SET price = 100 WHERE id = 1");
		expect(
			refused(
				db,
				"DELETE FROM bundle_items WHERE bundle_id = 1 AND variant_id = 3",
			),
		).toContain("bundle_requires_two_items");
	});

	test("a variant price change that would make a published bundle cost as much as its items is refused", () => {
		db.exec(
			"INSERT INTO bundle_items (bundle_id, variant_id, position) VALUES (1, 1, 1), (1, 2, 2)",
		);
		db.exec("UPDATE bundles SET status = 'published' WHERE id = 1");
		expect(refused(db, "UPDATE variants SET price = 6502 WHERE id = 1")).toBe(
			"accepted",
		);
		expect(
			refused(db, "UPDATE variants SET price = 6501 WHERE id = 1"),
		).toContain("bundle_price_not_below_items");
		expect(refused(db, "UPDATE variants SET price = 99999 WHERE id = 3")).toBe(
			"accepted",
		);
	});

	test("the items of a published bundle stay available", () => {
		db.exec(
			"INSERT INTO bundle_items (bundle_id, variant_id, position) VALUES (1, 1, 1), (1, 2, 2)",
		);
		db.exec("UPDATE bundles SET status = 'published' WHERE id = 1");
		expect(
			refused(db, "UPDATE variants SET status = 'archived' WHERE id = 2"),
		).toContain("bundle_item_unavailable");
		expect(
			refused(db, "UPDATE products SET status = 'archived' WHERE id = 2"),
		).toContain("bundle_item_unavailable");
		db.exec("UPDATE bundles SET status = 'archived' WHERE id = 1");
		expect(
			refused(db, "UPDATE products SET status = 'archived' WHERE id = 2"),
		).toBe("accepted");
		expect(refused(db, "DELETE FROM bundles")).toContain(
			"bundles_are_archived",
		);
	});
});

const user = (id: string, email: string, role: string | null) =>
	`INSERT INTO users (id, name, email, role) VALUES ('${id}', '${id}', '${email}', ${role === null ? "NULL" : `'${role}'`})`;

describe("account and customer rules", () => {
	beforeEach(() => {
		db = migratedDatabase();
	});

	test("a user's email is stored lower case and trimmed, and their role is one of the store's", () => {
		expect(refused(db, user("u1", "Ana@Example.com", "customer"))).toContain(
			"email_not_normalized",
		);
		expect(refused(db, user("u1", " ana@example.com", "customer"))).toContain(
			"email_not_normalized",
		);
		expect(refused(db, user("u1", "ana@example.com", "owner"))).toContain(
			"unknown_role",
		);
		expect(refused(db, user("u1", "ana@example.com", null))).toContain(
			"unknown_role",
		);
		expect(refused(db, user("u1", "ana@example.com", "customer"))).toBe(
			"accepted",
		);
		expect(refused(db, user("u2", "ana@example.com", "customer"))).toContain(
			"UNIQUE",
		);
	});

	test("a customer is linked once, to a customer account", () => {
		db.exec(user("u1", "ana@example.com", "customer"));
		db.exec(user("u2", "beto@example.com", "customer"));
		db.exec(user("s1", "soporte@example.com", "support"));
		expect(
			refused(
				db,
				"INSERT INTO customers (auth_user_id, email, search_key) VALUES ('s1', 'soporte@example.com', 'x')",
			),
		).toContain("customer_account_not_customer");
		db.exec(
			"INSERT INTO customers (id, email, search_key) VALUES (1, 'ana@example.com', 'x')",
		);
		expect(
			refused(db, "UPDATE customers SET auth_user_id = 's1' WHERE id = 1"),
		).toContain("customer_account_locked");
		db.exec("UPDATE customers SET auth_user_id = 'u1' WHERE id = 1");
		expect(
			refused(db, "UPDATE customers SET auth_user_id = 'u2' WHERE id = 1"),
		).toContain("customer_account_locked");
		expect(
			refused(
				db,
				"INSERT INTO customers (auth_user_id, search_key) VALUES ('u1', 'x')",
			),
		).toContain("UNIQUE");
		expect(refused(db, "DELETE FROM customers")).toContain(
			"customers_are_permanent",
		);
	});

	test("a customer email is unique and normalized, a phone is from El Salvador", () => {
		db.exec(
			"INSERT INTO customers (email, phone_e164, search_key) VALUES ('ana@example.com', '+50371234567', 'x')",
		);
		expect(
			refused(
				db,
				"INSERT INTO customers (email, search_key) VALUES ('ana@example.com', 'x')",
			),
		).toContain("UNIQUE");
		expect(
			refused(
				db,
				"INSERT INTO customers (email, search_key) VALUES ('Beto@example.com', 'x')",
			),
		).toContain("customers_email_normalized");
		for (const phone of [
			"+5037123456",
			"+525512345678",
			"71234567",
			"+503712345678",
		])
			expect(
				refused(
					db,
					`INSERT INTO customers (phone_e164, search_key) VALUES ('${phone}', 'x')`,
				),
			).toContain("customers_phone_e164");
		expect(
			refused(db, "INSERT INTO customers (search_key) VALUES ('guest')"),
		).toBe("accepted");
	});

	test("an address is in a real department and municipality, one is the default, and none is deleted", () => {
		db.exec("INSERT INTO customers (id, search_key) VALUES (1, 'x')");
		const address = (department: string, municipality: string, isDefault = 0) =>
			`INSERT INTO customer_addresses (customer_id, recipient_name, department, municipality, address_line, phone_e164, is_default) VALUES (1, 'Ana', '${department}', '${municipality}', 'Col. Escalón, calle 1', '+50371234567', ${isDefault})`;
		expect(refused(db, address("La Libertad", "La Libertad Sur", 1))).toBe(
			"accepted",
		);
		expect(refused(db, address("San Salvador", "La Libertad Sur"))).toContain(
			"customer_addresses_place",
		);
		expect(refused(db, address("Cuscatlán", "Cuscatlán Centro"))).toContain(
			"customer_addresses_place",
		);
		expect(
			refused(db, address("San Salvador", "San Salvador Centro", 1)),
		).toContain("UNIQUE");
		expect(
			refused(
				db,
				"UPDATE customer_addresses SET status = 'archived' WHERE is_default = 1",
			),
		).toContain("customer_addresses_default_active");
		expect(refused(db, "DELETE FROM customer_addresses")).toContain(
			"customer_addresses_are_archived",
		);
	});
});

describe("order follow-up", () => {
	beforeEach(() => {
		db = migratedDatabase();
		db.exec(`
			INSERT INTO store_settings (id, name, currency, default_locale, frequent_customer_min_orders, inactive_customer_days,
				followup_pending_payment_hours, followup_paid_unshipped_hours, followup_shipped_undelivered_hours)
			VALUES (1, 'Nagomi', 'USD', 'es', 3, 90, 48, 24, 96);
			INSERT INTO customers (id, search_key) VALUES (1, 'nuevo'), (2, 'ocasional'), (3, 'frecuente'), (4, 'inactivo');
			INSERT INTO brands (id, slug, name, search_key) VALUES (1, 'b', 'B', 'b');
			INSERT INTO categories (id, slug, icon) VALUES (1, 'c', 'mouse');
			INSERT INTO products (id, slug, brand_id, category_id) VALUES (1, 'p', 1, 1);
			INSERT INTO variants (id, product_id, sku, search_key, price) VALUES (1, 1, 'TEC-001', 'x', 100);
			INSERT INTO suppliers (id, name, search_key) VALUES (1, 's', 's');
			INSERT INTO purchase_orders (id, supplier_id, reference, status, ordered_on) VALUES (1, 1, 'PO-1', 'ordered', '2019-01-01');
			INSERT INTO purchase_order_items (id, purchase_order_id, variant_id, quantity, unit_cost) VALUES (1, 1, 1, 50, 10);
			INSERT INTO purchase_receipts (id, purchase_order_id, received_on, created_by) VALUES (1, 1, '2019-01-02', 'seed');
			INSERT INTO purchase_receipt_lines (id, receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) VALUES (1, 1, 1, 50, 0);
			INSERT INTO lots (id, variant_id, receipt_line_id, unit_cost_e4) VALUES (1, 1, 1, 100000);
			INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) VALUES (1, 'receive', 50, 'seed');
		`);
	});
	const ago = (hours: number) =>
		new Date(Date.now() - hours * 3_600_000)
			.toISOString()
			.replace(/\.\d{3}Z$/, "Z");
	const line = [{ variantId: 1, quantity: 1, unitPrice: 100 }];

	test("every status an order takes is kept with its own time, in order, and never rewritten", () => {
		db.exec(
			orderSql({
				id: 1,
				customerId: 1,
				status: "delivered",
				createdAt: "2026-11-01T10:00:00Z",
				paidAt: "2026-11-01T11:00:00Z",
				shippedAt: "2026-11-02T09:00:00Z",
				deliveredAt: "2026-11-03T15:00:00Z",
				lines: line,
			}),
		);
		expect(
			rows(
				db,
				"SELECT from_status, to_status, changed_at FROM order_status_history WHERE order_id = 1 ORDER BY id",
			),
		).toEqual([
			{
				from_status: null,
				to_status: "pending",
				changed_at: "2026-11-01T10:00:00Z",
			},
			{
				from_status: "pending",
				to_status: "paid",
				changed_at: "2026-11-01T11:00:00Z",
			},
			{
				from_status: "paid",
				to_status: "shipped",
				changed_at: "2026-11-02T09:00:00Z",
			},
			{
				from_status: "shipped",
				to_status: "delivered",
				changed_at: "2026-11-03T15:00:00Z",
			},
		]);
		expect(refused(db, "DELETE FROM order_status_history")).toContain(
			"order_status_history_append_only",
		);
		expect(
			refused(db, "UPDATE order_status_history SET changed_at = 'x'"),
		).toContain("order_status_history_append_only");
	});

	test("each open order waits for its next step until its deadline in the settings", () => {
		db.exec(
			orderSql({
				id: 1,
				createdAt: ago(50),
				method: "bank_transfer",
				lines: line,
			}),
		);
		db.exec(
			orderSql({ id: 2, createdAt: ago(10), method: "card", lines: line }),
		);
		db.exec(
			orderSql({
				id: 3,
				createdAt: ago(30),
				method: "cash_on_delivery",
				lines: line,
			}),
		);
		db.exec(
			orderSql({
				id: 4,
				status: "paid",
				createdAt: ago(40),
				paidAt: ago(30),
				lines: line,
			}),
		);
		db.exec(
			orderSql({
				id: 5,
				status: "shipped",
				createdAt: ago(200),
				paidAt: ago(199),
				shippedAt: ago(100),
				lines: line,
			}),
		);
		db.exec(
			orderSql({
				id: 6,
				status: "shipped",
				createdAt: ago(30),
				paidAt: ago(29),
				shippedAt: ago(20),
				lines: line,
			}),
		);
		expect(
			rows(
				db,
				"SELECT order_id, status, action, deadline_hours FROM order_followups ORDER BY order_id",
			),
		).toEqual([
			{
				order_id: 1,
				status: "pending",
				action: "collect_payment",
				deadline_hours: 48,
			},
			{ order_id: 3, status: "pending", action: "ship", deadline_hours: 24 },
			{ order_id: 4, status: "paid", action: "ship", deadline_hours: 24 },
			{
				order_id: 5,
				status: "shipped",
				action: "confirm_delivery",
				deadline_hours: 96,
			},
		]);
	});

	test("customers are segmented by what they bought and the thresholds in the settings", () => {
		const recent = ago(5 * 24);
		db.exec(
			orderSql({
				id: 1,
				customerId: 2,
				status: "paid",
				createdAt: recent,
				lines: line,
			}),
		);
		for (const id of [2, 3, 4])
			db.exec(
				orderSql({
					id,
					customerId: 3,
					status: "delivered",
					createdAt: recent,
					lines: line,
				}),
			);
		db.exec(
			orderSql({
				id: 5,
				customerId: 4,
				status: "delivered",
				createdAt: "2020-01-01T00:00:00Z",
				lines: line,
			}),
		);
		db.exec(orderSql({ id: 6, customerId: 1, createdAt: recent, lines: line }));
		db.exec(
			orderSql({
				id: 7,
				customerId: 1,
				status: "cancelled",
				createdAt: recent,
				lines: line,
			}),
		);
		expect(
			rows(
				db,
				"SELECT customer_id, order_count, segment FROM customer_segments ORDER BY customer_id",
			),
		).toEqual([
			{ customer_id: 1, order_count: 0, segment: "new" },
			{ customer_id: 2, order_count: 1, segment: "occasional" },
			{ customer_id: 3, order_count: 3, segment: "frequent" },
			{ customer_id: 4, order_count: 1, segment: "inactive" },
		]);
		db.exec("UPDATE store_settings SET frequent_customer_min_orders = NULL");
		expect(rows(db, "SELECT DISTINCT segment FROM customer_segments")).toEqual([
			{ segment: null },
		]);
	});

	test("only a customer with a delivered order of the product reviews it, once", () => {
		const review = (customer: number, rating = 5) =>
			`INSERT INTO product_reviews (product_id, customer_id, rating, title, body) VALUES (1, ${customer}, ${rating}, 'Muy bueno', 'Llegó rápido.')`;
		db.exec(orderSql({ id: 1, customerId: 2, status: "shipped", lines: line }));
		expect(refused(db, review(2))).toContain("review_requires_delivered_order");
		db.exec(
			orderSql({ id: 2, customerId: 3, status: "delivered", lines: line }),
		);
		expect(refused(db, review(3, 6))).toContain("product_reviews_rating");
		expect(refused(db, review(3, 0))).toContain("product_reviews_rating");
		expect(refused(db, review(3))).toBe("accepted");
		expect(refused(db, review(3, 4))).toContain(
			"UNIQUE constraint failed: product_reviews.customer_id, product_reviews.product_id",
		);
		expect(refused(db, "UPDATE product_reviews SET customer_id = 2")).toContain(
			"review_identity_locked",
		);
		expect(
			refused(db, "UPDATE product_reviews SET rating = 4, status = 'approved'"),
		).toBe("accepted");
		expect(
			refused(db, "UPDATE product_reviews SET status = 'hidden'"),
		).toContain("product_reviews_status");
	});

	test("a cart line is one size or one set with a positive quantity, once per cart", () => {
		db.exec("UPDATE products SET status = 'published'");
		db.exec(`INSERT INTO carts (id) VALUES ('${"a".repeat(32)}')`);
		const item = (variant: string, bundle: string, quantity: number) =>
			`INSERT INTO cart_items (cart_id, variant_id, bundle_id, quantity) VALUES ('${"a".repeat(32)}', ${variant}, ${bundle}, ${quantity})`;
		expect(refused(db, "INSERT INTO carts (id) VALUES ('short')")).toContain(
			"carts_id",
		);
		expect(refused(db, item("1", "NULL", 0))).toContain("cart_items_quantity");
		expect(refused(db, item("NULL", "NULL", 1))).toContain(
			"cart_items_one_kind",
		);
		expect(refused(db, item("1", "NULL", 2))).toBe("accepted");
		expect(refused(db, item("1", "NULL", 1))).toContain(
			"UNIQUE constraint failed",
		);
		db.exec("UPDATE products SET status = 'draft'");
		db.exec("DELETE FROM cart_items");
		expect(refused(db, item("1", "NULL", 1))).toContain(
			"cart_item_unavailable",
		);
	});

	test("a pending stock alert is one per size and email, and is notified once", () => {
		const alert = (email: string) =>
			`INSERT INTO stock_alerts (variant_id, email) VALUES (1, '${email}')`;
		expect(refused(db, alert("Ana@Example.com"))).toContain(
			"stock_alerts_email",
		);
		expect(refused(db, alert("ana@example.com"))).toBe("accepted");
		expect(refused(db, alert("ana@example.com"))).toContain(
			"UNIQUE constraint failed",
		);
		db.exec("UPDATE stock_alerts SET notified_at = '2026-11-01T00:00:00Z'");
		expect(refused(db, "UPDATE stock_alerts SET notified_at = NULL")).toContain(
			"stock_alert_locked",
		);
		expect(refused(db, alert("ana@example.com"))).toBe("accepted");
	});
});
