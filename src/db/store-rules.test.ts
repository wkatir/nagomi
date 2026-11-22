import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { migratedDatabase } from "./test-database";

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
		`);
	});

	const order = (id: number, customerId: number, createdAt: string) =>
		`INSERT INTO orders (id, code, idempotency_key, request_hash, customer_id, search_key, locale, channel, subtotal, total, created_at)
			VALUES (${id}, 'NAG-${id}', 'k${id}', 'h', ${customerId}, 'x', 'es', 'whatsapp', 0, 0, '${createdAt}')`;
	const confirm = (id: number) =>
		`UPDATE orders SET status = 'confirmed', confirmed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 hours'), payment_method = 'cash',
			shipping_method = 'pickup', delivery_estimate_from = '2026-01-01', delivery_estimate_to = '2026-01-01', confirmation_message = 'ok' WHERE id = ${id}`;

	const withLine = (id: number) =>
		`INSERT INTO variants (id, product_id, sku, search_key, price) SELECT 1, 1, 'TEC-001', 'x', 100 WHERE NOT EXISTS (SELECT 1 FROM variants);
		INSERT OR IGNORE INTO suppliers (id, name, search_key) VALUES (1, 's', 's');
		INSERT OR IGNORE INTO purchase_orders (id, supplier_id, reference, status, ordered_on) VALUES (1, 1, 'PO-1', 'ordered', '2026-01-01');
		INSERT OR IGNORE INTO purchase_order_items (id, purchase_order_id, variant_id, quantity, unit_cost) VALUES (1, 1, 1, 50, 10);
		INSERT OR IGNORE INTO purchase_receipts (id, purchase_order_id, received_on, created_by) VALUES (1, 1, '2026-01-02', 'seed');
		INSERT OR IGNORE INTO purchase_receipt_lines (id, receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) VALUES (1, 1, 1, 50, 0);
		INSERT OR IGNORE INTO lots (id, variant_id, receipt_line_id, unit_cost_e4) VALUES (1, 1, 1, 100000);
		INSERT INTO inventory_movements (lot_id, kind, quantity, created_by) SELECT 1, 'receive', 50, 'seed' WHERE NOT EXISTS (SELECT 1 FROM inventory_movements);
		INSERT INTO order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) VALUES (${id}, 1, 1, 0, 'TEC-001', 'b', 'p');`;

	test("every status an order takes is kept, in order, and never rewritten", () => {
		db.exec(
			"INSERT INTO brands (id, slug, name, search_key) VALUES (1, 'b', 'B', 'b'); INSERT INTO categories (id, slug, icon) VALUES (1, 'c', 'mouse'); INSERT INTO products (id, slug, brand_id, category_id) VALUES (1, 'p', 1, 1);",
		);
		db.exec(order(1, 1, "2026-11-01T10:00:00Z"));
		db.exec(withLine(1));
		db.exec(confirm(1));
		expect(
			rows(
				db,
				"SELECT from_status, to_status FROM order_status_history WHERE order_id = 1 ORDER BY id",
			),
		).toEqual([
			{ from_status: null, to_status: "pending" },
			{ from_status: "pending", to_status: "confirmed" },
		]);
		expect(refused(db, "DELETE FROM order_status_history")).toContain(
			"order_status_history_append_only",
		);
		expect(
			rows(db, "SELECT order_id, status, deadline_hours FROM order_followups"),
		).toEqual([{ order_id: 1, status: "confirmed", deadline_hours: 24 }]);
	});

	test("orders pending payment past their deadline are listed, recent ones are not", () => {
		db.exec(order(1, 1, "2020-01-01T00:00:00Z"));
		db.exec(
			`${order(2, 1, "2999-01-01T00:00:00Z").replace("'2999-01-01T00:00:00Z'", "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')")}`,
		);
		expect(rows(db, "SELECT order_id, status FROM order_followups")).toEqual([
			{ order_id: 1, status: "pending" },
		]);
	});

	test("customers are segmented by their purchases and the thresholds in the settings", () => {
		db.exec(
			"INSERT INTO brands (id, slug, name, search_key) VALUES (1, 'b', 'B', 'b'); INSERT INTO categories (id, slug, icon) VALUES (1, 'c', 'mouse'); INSERT INTO products (id, slug, brand_id, category_id) VALUES (1, 'p', 1, 1);",
		);
		const recent = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 days')";
		const bought = (id: number, customer: number, at: string) => {
			db.exec(order(id, customer, "x").replace("'x')", `${at})`));
			db.exec(withLine(id));
			db.exec(confirm(id));
		};
		bought(1, 2, recent);
		for (const id of [2, 3, 4]) bought(id, 3, recent);
		bought(5, 4, "'2020-01-01T00:00:00Z'");
		db.exec(order(6, 1, "2026-11-01T00:00:00Z"));
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
});
