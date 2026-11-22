import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";
import { searchKey } from "../../domain/search";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { apiError } = await import("#/server/api-error");
const { customersRouter } = await import("./customers");
const { listCustomers } = await import("../../domain/customer-queries");
const { getDb } = await import("#/db");

const app = new Hono<AdminEnv>()
	.onError(apiError)
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/customers", customersRouter);

type Row = {
	id: number;
	name: string | null;
	orders: number;
	lifetimeValue: number;
	netPaid: number;
	balance: number;
	firstOrderAt: string | null;
	lastOrderAt: string | null;
};
type Page = {
	items: Row[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/customers${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const ids = (page: Page) => page.items.map((c) => c.id);

let db: Database;

function customer(c: {
	name: string | null;
	phone: string;
	email?: string;
	createdAt: string;
}) {
	db.prepare(
		"insert into customers (name, phone_e164, email, search_key, created_at) values (?, ?, ?, ?, ?)",
	).run(
		c.name,
		c.phone,
		c.email ?? null,
		searchKey(c.name, c.email, c.phone.replace(/\D/g, "")),
		c.createdAt,
	);
}

type Line = { quantity: number; unitPrice: number; returned?: number };
let nextOrder = 0;
function order(o: {
	customerId: number;
	status: "pending" | "confirmed" | "delivered" | "cancelled";
	createdAt: string;
	lines: Line[];
	discount?: number;
	shipping?: number;
	paid?: number;
}) {
	const id = ++nextOrder;
	const subtotal = o.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
	const discount = o.discount ?? 0;
	const shipping = o.shipping ?? 0;
	db.exec(
		`insert into orders (id, code, idempotency_key, request_hash, locale, channel, status, subtotal, discount, discount_reason, shipping, total, search_key, customer_id, created_at) values (${id}, 'O-${id}', 'k${id}', 'h', 'es', 'whatsapp', '${o.status}', ${subtotal}, ${discount}, ${discount > 0 ? "'promo'" : "NULL"}, ${shipping}, ${subtotal - discount + shipping}, 'o-${id}', ${o.customerId}, '${o.createdAt}')`,
	);
	o.lines.forEach((line, n) => {
		db.exec(
			`insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (${id}, ${n + 1}, ${line.quantity}, ${line.unitPrice}, 'SKU${n + 1}', 'Brand', 'Aceite')`,
		);
		if (line.returned) {
			db.exec(
				`insert into returns (order_id, reason, created_by) values (${id}, 'other', 'u')`,
			);
			db.exec(
				`insert into return_lines (return_id, order_item_id, lot_id, quantity, disposition) values (last_insert_rowid(), (select max(id) from order_items), 1, ${line.returned}, 'restock')`,
			);
		}
	});
	if (o.paid)
		db.exec(
			`insert into payments (order_id, kind, method, amount, status, recorded_by) values (${id}, 'payment', 'cash', ${o.paid}, 'confirmed', 'u')`,
		);
}

beforeEach(() => {
	nextOrder = 0;
	db = migratedDatabase();
	// These tests are about what the queries read; the triggers that guard the data would
	// only ask for stock and states that have nothing to do with them.
	const triggers = db
		.query("select name from sqlite_master where type = 'trigger'")
		.all() as { name: string }[];
	for (const { name } of triggers) db.exec(`drop trigger "${name}"`);
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold, frequent_customer_min_orders, inactive_customer_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 5, 3, 90);
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon) values ('teclados', 'keyboard');
insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
insert into variants (product_id, sku, price, search_key) values (1, 'SKU-001', 1000, 'sku-001'), (1, 'SKU-002', 1000, 'sku-002'), (1, 'SKU-003', 1000, 'sku-003');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 50, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 50, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 70000);
`);
	env.DB = d1(db);
	customer({
		name: "Ana Pérez",
		phone: "+50371234567",
		createdAt: "2026-09-01T12:00:00Z",
	});
	customer({
		name: "Álvaro Gómez",
		phone: "+50372345678",
		createdAt: "2026-09-02T12:00:00Z",
	});
	customer({
		name: "Beto",
		phone: "+50373456789",
		email: "beto@example.com",
		createdAt: "2026-09-03T12:00:00Z",
	});
	customer({
		name: "Carla",
		phone: "+50374567890",
		createdAt: "2026-09-04T12:00:00Z",
	});
	customer({
		name: null,
		phone: "+50375678901",
		createdAt: "2026-09-05T12:00:00Z",
	});
	// Ana: a delivered order with a discount and shipping, a confirmed one, and two that
	// are not sales (cancelled, pending).
	order({
		customerId: 1,
		status: "delivered",
		createdAt: "2026-10-01T12:00:00Z",
		lines: [{ quantity: 2, unitPrice: 1500 }],
		discount: 300,
		shipping: 500,
		paid: 3200,
	});
	order({
		customerId: 1,
		status: "confirmed",
		createdAt: "2026-10-10T12:00:00Z",
		lines: [{ quantity: 1, unitPrice: 1000 }],
	});
	order({
		customerId: 1,
		status: "cancelled",
		createdAt: "2026-10-15T12:00:00Z",
		lines: [{ quantity: 9, unitPrice: 9000 }],
	});
	order({
		customerId: 1,
		status: "pending",
		createdAt: "2026-10-16T12:00:00Z",
		lines: [{ quantity: 9, unitPrice: 9000 }],
	});
	// Álvaro: one unit of the first line came back, and the discount follows the units kept.
	order({
		customerId: 2,
		status: "delivered",
		createdAt: "2026-10-05T12:00:00Z",
		lines: [
			{ quantity: 2, unitPrice: 2000, returned: 1 },
			{ quantity: 1, unitPrice: 1000 },
		],
		discount: 505,
		shipping: 400,
	});
	// Beto: two orders, the second shipped far away: he owes more than Álvaro though he kept
	// fewer goods, so the amount owed and the value of the goods sort differently.
	order({
		customerId: 3,
		status: "delivered",
		createdAt: "2026-10-02T12:00:00Z",
		lines: [{ quantity: 1, unitPrice: 900 }],
	});
	order({
		customerId: 3,
		status: "delivered",
		createdAt: "2026-10-03T12:00:00Z",
		lines: [{ quantity: 1, unitPrice: 1300 }],
		shipping: 1000,
	});
	// Carla has no orders. The customer without a name has one big confirmed order.
	order({
		customerId: 5,
		status: "confirmed",
		createdAt: "2026-10-20T12:00:00Z",
		lines: [{ quantity: 1, unitPrice: 7000 }],
		shipping: 300,
	});
});

describe("GET /customers", () => {
	test("pages the newest customer first, with the total and the totals of each", async () => {
		const page = await list();
		expect(ids(page)).toEqual([5, 4, 3, 2, 1]);
		expect(page).toMatchObject({
			total: 5,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const byId = Object.fromEntries(page.items.map((c) => [c.id, c]));
		// 3000 - 300 + 500, and the confirmed order of 1000; cancelled and pending do not count.
		expect(byId[1]).toMatchObject({
			orders: 2,
			lifetimeValue: 4200,
			netPaid: 3200,
			balance: 1000,
			firstOrderAt: "2026-10-01T12:00:00Z",
			lastOrderAt: "2026-10-10T12:00:00Z",
		});
		// 3000 kept of 5000 takes 303 of the 505 discount (rounded half up), plus 400.
		expect(byId[2]).toMatchObject({ orders: 1, lifetimeValue: 3097 });
		expect(byId[3]).toMatchObject({ orders: 2, lifetimeValue: 3200 });
		expect(byId[4]).toMatchObject({
			orders: 0,
			lifetimeValue: 0,
			firstOrderAt: null,
			lastOrderAt: null,
		});
		expect(byId[5]).toMatchObject({ orders: 1, lifetimeValue: 7300 });
		// A row is the customer's line in the table: no search key and no consents.
		expect(Object.keys(page.items[0]).sort()).toEqual(
			[
				"balance",
				"createdAt",
				"email",
				"firstOrderAt",
				"hasAccount",
				"id",
				"lastOrderAt",
				"lifetimeValue",
				"name",
				"netPaid",
				"notes",
				"orders",
				"phoneE164",
				"segment",
			].sort(),
		);
	});

	test("takes the page size and page the screen asks for, and answers a page past the end empty", async () => {
		for (let n = 6; n <= 17; n++)
			customer({
				name: `Cliente ${n}`,
				phone: `+503700000${String(n).padStart(2, "0")}`,
				createdAt: `2026-08-${String(n).padStart(2, "0")}T12:00:00Z`,
			});
		const first = await list("pageSize=10");
		expect(ids(first)).toEqual([5, 4, 3, 2, 1, 17, 16, 15, 14, 13]);
		expect(first).toMatchObject({ total: 17, pageSize: 10, pageCount: 2 });
		const second = await list("pageSize=10&page=2");
		expect(ids(second)).toEqual([12, 11, 10, 9, 8, 7, 6]);
		expect(second).toMatchObject({ total: 17, page: 2, pageCount: 2 });
		const past = await list("pageSize=10&page=9");
		expect(past).toMatchObject({ items: [], total: 17, page: 9, pageCount: 2 });
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			ids(await list(`sort=${sort}&dir=${dir}`));
		// Without a name, the search key starts with the phone digits, so that customer is first.
		expect(await sorted("name", "asc")).toEqual([5, 2, 1, 3, 4]);
		expect(await sorted("name", "desc")).toEqual([4, 3, 1, 2, 5]);
		expect(await sorted("createdAt", "asc")).toEqual([1, 2, 3, 4, 5]);
		expect(await sorted("createdAt", "desc")).toEqual([5, 4, 3, 2, 1]);
		// 2, 2, 1, 1, 0 booked orders: the ties go by id in the direction chosen.
		expect(await sorted("orders", "desc")).toEqual([3, 1, 5, 2, 4]);
		expect(await sorted("orders", "asc")).toEqual([4, 2, 5, 1, 3]);
		expect(await sorted("spent", "desc")).toEqual([5, 1, 3, 2, 4]);
		expect(await sorted("spent", "asc")).toEqual([4, 2, 3, 1, 5]);
		// Whoever never ordered has no last order: first when ascending.
		expect(await sorted("lastOrder", "desc")).toEqual([5, 1, 2, 3, 4]);
		expect(await sorted("lastOrder", "asc")).toEqual([4, 3, 2, 1, 5]);
	});

	test("sorts by what the rows show", async () => {
		const spent = (await list("sort=spent&dir=desc")).items.map(
			(c) => c.lifetimeValue,
		);
		expect(spent).toEqual([7300, 4200, 3200, 3097, 0]);
		const last = (await list("sort=lastOrder&dir=desc")).items.map(
			(c) => c.lastOrderAt,
		);
		expect(last).toEqual([
			"2026-10-20T12:00:00Z",
			"2026-10-10T12:00:00Z",
			"2026-10-05T12:00:00Z",
			"2026-10-03T12:00:00Z",
			null,
		]);
	});

	test("searches the name without accents or capitals, the email and the phone", async () => {
		expect(ids(await list("q=ANA"))).toEqual([1]);
		expect(ids(await list("q=perez"))).toEqual([1]);
		expect(ids(await list("q=alvaro"))).toEqual([2]);
		expect(ids(await list("q=%C3%81lvaro"))).toEqual([2]);
		expect(ids(await list("q=beto@example"))).toEqual([3]);
		expect(ids(await list("q=7123-4567"))).toEqual([1]);
		expect(ids(await list("q=%2B503%207567%208901"))).toEqual([5]);
		const none = await list("q=zzz");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
		// The total follows the search, and the sort applies to what matches.
		const both = await list("q=50373&sort=name&dir=desc");
		expect(ids(both)).toEqual([3]);
		expect(both.total).toBe(1);
	});

	test("segments each customer by purchases and the thresholds in the settings, and filters by segment", async () => {
		db.exec("update store_settings set inactive_customer_days = 100000");
		const segments = async (query = "") =>
			Object.fromEntries(
				(await list(query)).items.map((c) => [
					c.id,
					(c as Row & { segment: string }).segment,
				]),
			);
		expect(await segments()).toEqual({
			1: "occasional",
			2: "occasional",
			3: "occasional",
			4: "new",
			5: "occasional",
		});
		db.exec("update store_settings set frequent_customer_min_orders = 2");
		expect(ids(await list("segment=frequent"))).toEqual([3, 1]);
		expect(ids(await list("segment=new"))).toEqual([4]);
		db.exec("update store_settings set inactive_customer_days = 1");
		expect(ids(await list("segment=inactive"))).toEqual([5, 3, 2, 1]);
		expect(ids(await list("segment=inactive&q=beto"))).toEqual([3]);
		expect((await app.request("/customers?segment=vip")).status).toBe(400);
	});

	test("says whether the customer has an account", async () => {
		db.exec(
			"insert into users (id, name, email, role) values ('u1', 'Beto', 'beto@example.com', 'customer'); update customers set auth_user_id = 'u1' where id = 3",
		);
		const page = await list();
		expect(
			page.items.map((c) => [
				c.id,
				(c as Row & { hasAccount: boolean }).hasAccount,
			]),
		).toEqual([
			[5, false],
			[4, false],
			[3, true],
			[2, false],
			[1, false],
		]);
		expect(JSON.stringify(page)).not.toContain("authUserId");
	});

	test("refuses an unknown sort, a page size it does not offer and an empty search", async () => {
		for (const query of [
			"sort=password",
			"sort=phone",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"q=",
			`q=${"x".repeat(81)}`,
		]) {
			const res = await app.request(`/customers?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("listCustomers", () => {
	test("pages the newest first by cursor, with totals and the current consents", async () => {
		db.exec(`
insert into pages (slug) values ('privacy');
insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', 1, 'Privacidad', 'x');
insert into customer_consents (customer_id, purpose, granted, page_version_id, channel) values (1, 'marketing_whatsapp', 1, 1, 'web'), (1, 'marketing_whatsapp', 0, 1, 'whatsapp'), (2, 'marketing_whatsapp', 1, 1, 'web');
`);
		const first = await listCustomers(getDb(), {}, null, 2);
		expect(first.customers.map((c) => c.id)).toEqual([5, 4]);
		expect(first.nextCursor).toBe(4);
		const second = await listCustomers(getDb(), {}, first.nextCursor, 2);
		expect(second.customers.map((c) => c.id)).toEqual([3, 2]);
		const last = await listCustomers(getDb(), {}, second.nextCursor, 2);
		expect(last.customers.map((c) => c.id)).toEqual([1]);
		expect(last.nextCursor).toBeNull();
		// The latest row per purpose is the current choice: Ana withdrew hers.
		expect(last.customers[0].consents).toMatchObject([
			{ purpose: "marketing_whatsapp", granted: false },
		]);
		expect(second.customers[1].consents).toMatchObject([
			{ purpose: "marketing_whatsapp", granted: true },
		]);
		expect(second.customers[0].consents).toEqual([]);
		expect(last.customers[0]).toMatchObject({
			orders: 2,
			lifetimeValue: 4200,
		});
		const found = await listCustomers(getDb(), { q: "carla" }, null, 10);
		expect(found.customers.map((c) => c.id)).toEqual([4]);
	});
});

describe("GET /customers/:id", () => {
	test("is the customer with totals, consents and every order, newest first", async () => {
		db.exec(`
insert into pages (slug) values ('privacy');
insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', 1, 'Privacidad', 'x');
insert into customer_consents (customer_id, purpose, granted, page_version_id, channel) values (2, 'marketing_whatsapp', 1, 1, 'web'), (2, 'marketing_whatsapp', 0, 1, 'whatsapp');
`);
		const res = await app.request("/customers/2");
		expect(res.status).toBe(200);
		const detail = (await res.json()) as {
			customer: { name: string; searchKey?: string };
			totals: { orders: number; lifetimeValue: number };
			consents: { purpose: string; granted: boolean }[];
			consentHistory: { granted: boolean }[];
			orders: { code: string; units: number; payment: { owed: number } }[];
		};
		expect(detail.customer).toMatchObject({ id: 2, name: "Álvaro Gómez" });
		expect(detail.customer.searchKey).toBeUndefined();
		expect(detail.totals).toMatchObject({ orders: 1, lifetimeValue: 3097 });
		expect(detail.consents).toMatchObject([
			{ purpose: "marketing_whatsapp", granted: false },
		]);
		expect(detail.consentHistory.map((c) => c.granted)).toEqual([false, true]);
		expect(detail.orders).toMatchObject([
			{ code: "O-5", units: 2, payment: { owed: 3097 } },
		]);

		const ana = (await (await app.request("/customers/1")).json()) as {
			orders: { code: string; status: string }[];
		};
		expect(ana.orders.map((o) => o.code)).toEqual(["O-4", "O-3", "O-2", "O-1"]);
	});

	test("includes the addresses, the default first, archived ones marked, and the segment", async () => {
		db.exec(`
insert into customer_addresses (customer_id, recipient_name, department, municipality, address_line, phone_e164, is_default, status) values (2, 'Álvaro', 'San Salvador', 'San Salvador Centro', 'Calle Arce 1', '+50372345678', 0, 'archived'), (2, 'Álvaro', 'La Libertad', 'La Libertad Sur', 'Santa Tecla, 4a Av. Norte', '+50372345678', 1, 'active');
`);
		const detail = (await (await app.request("/customers/2")).json()) as {
			customer: { segment: string; purchaseCount: number; hasAccount: boolean };
			addresses: { municipality: string; isDefault: boolean; status: string }[];
		};
		expect(detail.customer).toMatchObject({
			purchaseCount: 1,
			hasAccount: false,
		});
		expect(detail.addresses).toMatchObject([
			{ municipality: "La Libertad Sur", isDefault: true, status: "active" },
			{
				municipality: "San Salvador Centro",
				isDefault: false,
				status: "archived",
			},
		]);
	});

	test("a customer without orders has empty totals", async () => {
		const detail = (await (await app.request("/customers/4")).json()) as {
			totals: unknown;
			orders: unknown[];
		};
		expect(detail.totals).toEqual({
			orders: 0,
			lifetimeValue: 0,
			netPaid: 0,
			balance: 0,
			firstOrderAt: null,
			lastOrderAt: null,
		});
		expect(detail.orders).toEqual([]);
	});

	test("answers 404 for a customer that does not exist and 400 for a bad id", async () => {
		expect((await app.request("/customers/99")).status).toBe(404);
		expect((await app.request("/customers/abc")).status).toBe(400);
	});
});

describe("PATCH /customers/:id", () => {
	const patch = (id: number, body: unknown) =>
		app.request(`/customers/${id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	const stored = (id: number) =>
		db.query("select * from customers where id = ?").get(id) as {
			name: string | null;
			phone_e164: string;
			email: string | null;
			notes: string | null;
			search_key: string;
		};

	test("changes the profile, normalizes the phone and keeps the search key in step", async () => {
		const res = await patch(1, {
			name: "Ana Pérez Ruiz",
			phone: "7999-0000",
			email: " ANA@Example.com ",
			notes: "  Prefiere WhatsApp  ",
		});
		expect(res.status).toBe(200);
		expect(stored(1)).toMatchObject({
			name: "Ana Pérez Ruiz",
			phone_e164: "+50379990000",
			email: "ana@example.com",
			notes: "Prefiere WhatsApp",
			search_key: "ana perez ruiz ana@example.com 50379990000",
		});
		expect(ids(await list("q=ruiz"))).toEqual([1]);
		expect(ids(await list("q=7999-0000"))).toEqual([1]);
		expect(ids(await list("q=71234567"))).toEqual([]);
		const event = db
			.query(
				"select action, entity_type, entity_id, actor_user_id, data from audit_events",
			)
			.get() as Record<string, unknown>;
		expect(event).toMatchObject({
			action: "customer.update",
			entity_type: "customer",
			entity_id: "1",
			actor_user_id: "admin",
		});
		expect(JSON.parse(event.data as string)).toEqual({
			before: {
				name: "Ana Pérez",
				phoneE164: "+50371234567",
				email: null,
				notes: null,
			},
			after: {
				name: "Ana Pérez Ruiz",
				phoneE164: "+50379990000",
				email: "ana@example.com",
				notes: "Prefiere WhatsApp",
			},
		});
	});

	test("changes only what it is given, and clears the email and the notes", async () => {
		await patch(3, { notes: "Cliente frecuente" });
		expect(stored(3)).toMatchObject({
			name: "Beto",
			email: "beto@example.com",
			notes: "Cliente frecuente",
		});
		await patch(3, { email: null, notes: "" });
		expect(stored(3)).toMatchObject({
			name: "Beto",
			phone_e164: "+50373456789",
			email: null,
			notes: null,
			search_key: "beto 50373456789",
		});
	});

	test("refuses a phone another customer has, an invalid one and an empty change", async () => {
		const taken = await patch(1, { phone: "+503 7234 5678" });
		expect(taken.status).toBe(409);
		expect(await taken.text()).toBe(
			JSON.stringify({ error: "duplicate_phone" }),
		);
		const invalid = await patch(1, { phone: "12" });
		expect(invalid.status).toBe(400);
		expect(await invalid.text()).toBe(
			JSON.stringify({ error: "invalid_phone" }),
		);
		for (const body of [{}, { name: "" }, { email: "no-email" }]) {
			const res = await patch(1, body);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
		expect(stored(1)).toMatchObject({
			name: "Ana Pérez",
			phone_e164: "+50371234567",
		});
		expect(db.query("select count(*) as n from audit_events").get()).toEqual({
			n: 0,
		});
	});

	test("refuses an email another customer has, whatever its case, and a phone from outside El Salvador", async () => {
		const taken = await patch(1, { email: "BETO@example.com" });
		expect(taken.status).toBe(409);
		expect((await taken.json()) as unknown).toEqual({
			error: "duplicate_email",
		});
		const foreign = await patch(1, { phone: "+52 55 1234 5678" });
		expect(foreign.status).toBe(422);
		expect((await foreign.json()) as unknown).toEqual({
			error: "phone_not_salvadoran",
		});
		expect((await patch(1, { phone: null })).status).toBe(200);
		expect(stored(1).phone_e164).toBeNull();
	});

	test("answers 404 for a customer that does not exist", async () => {
		expect((await patch(99, { name: "Nadie" })).status).toBe(404);
	});
});
