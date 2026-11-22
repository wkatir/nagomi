import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase, orderSql } from "#/db/test-database";

let session: { user: { id: string; role?: string; banned?: boolean } } | null =
	null;
const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
mock.module("#/lib/auth", () => ({
	auth: { api: { getSession: async () => session } },
	authMethods: { google: false, password: true },
}));
const { apiError } = await import("#/server/api-error");
const { account } = await import("./account");

const app = new Hono().onError(apiError).route("/account", account);

const send = (method: string, path: string, body?: unknown) =>
	app.request(`/account${path}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
const json = async <T>(res: Response) => (await res.json()) as T;

let db: Database;
const as = (userId: string, role = "customer") => {
	session = { user: { id: userId, role } };
};

const address = {
	recipientName: "Ana Pérez",
	department: "La Libertad",
	municipality: "La Libertad Sur",
	addressLine: "Col. Utila, pasaje 3, casa 12",
	reference: "Frente al parque",
	phone: "7123 4567",
};

type Address = typeof address & { id: number; isDefault: boolean };

beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Nagomi', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 10, 5);
insert into users (id, name, email, role) values ('u-ana', 'Ana', 'ana@example.com', 'customer'), ('u-beto', 'Beto', 'beto@example.com', 'customer'), ('u-staff', 'Soporte', 'soporte@example.com', 'support'), ('u-lost', 'Sin ficha', 'lost@example.com', 'customer');
insert into customers (id, auth_user_id, name, email, phone_e164, search_key) values (1, 'u-ana', 'Ana', 'ana@example.com', '+50371234567', 'ana'), (2, 'u-beto', 'Beto', 'beto@example.com', null, 'beto');
insert into pages (id, slug, is_published) values (1, 'privacy', 1), (2, 'terms', 1);
insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', 1, 'Privacidad', 'x'), (2, 'es', 1, 'Términos', 'x');
${orderSql({ id: 1, code: "NAG-1", customerId: 1, createdAt: "2026-11-01T10:00:00Z", lines: [] })}
${orderSql({ id: 2, code: "NAG-2", customerId: 2, createdAt: "2026-11-02T10:00:00Z", lines: [] })}
`);
	env.DB = d1(db);
	as("u-ana");
});

describe("who may use the account API", () => {
	test("answers 401 without a session", async () => {
		session = null;
		for (const path of ["/profile", "/addresses", "/orders"])
			expect((await send("GET", path)).status).toBe(401);
	});

	test("answers 403 to staff, a banned customer and an account without a customer row", async () => {
		for (const user of [
			{ id: "u-staff", role: "support" },
			{ id: "u-ana", role: "customer", banned: true },
			{ id: "u-lost", role: "customer" },
		]) {
			session = { user };
			expect((await send("GET", "/profile")).status).toBe(403);
		}
	});
});

describe("profile", () => {
	test("is the customer's own name, email, phone and marketing choices", async () => {
		const res = await send("GET", "/profile");
		expect(res.status).toBe(200);
		expect(await json<unknown>(res)).toEqual({
			name: "Ana",
			email: "ana@example.com",
			phone: "+50371234567",
			consents: { marketingEmail: null, marketingWhatsapp: null },
		});
	});

	test("changes the name and phone, keeps the email, and refuses a phone from another country", async () => {
		const res = await send("PATCH", "/profile", {
			name: "Ana María",
			phone: "7654-3210",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			name: "Ana María",
			phone: "+50376543210",
			email: "ana@example.com",
		});
		expect(
			(await send("PATCH", "/profile", { email: "otra@example.com" })).status,
		).toBe(400);
		const foreign = await send("PATCH", "/profile", {
			phone: "+52 55 1234 5678",
		});
		expect(foreign.status).toBe(422);
		expect(await json<unknown>(foreign)).toEqual({
			error: "phone_not_salvadoran",
		});
		expect((await send("PATCH", "/profile", { phone: null })).status).toBe(200);
		expect(
			db
				.query("select phone_e164, search_key from customers where id = 1")
				.get(),
		).toEqual({ phone_e164: null, search_key: "ana maria ana@example.com" });
	});

	test("a phone another customer has is a 409", async () => {
		as("u-beto");
		const res = await send("PATCH", "/profile", { phone: "+503 7123 4567" });
		expect(res.status).toBe(409);
		expect(await json<unknown>(res)).toEqual({ error: "duplicate_phone" });
	});

	test("a sign-up records the privacy notice acknowledged with the marketing choices", async () => {
		const res = await send("PUT", "/consents", {
			locale: "es",
			privacyNotice: true,
			marketingEmail: false,
			marketingWhatsapp: true,
		});
		expect(res.status).toBe(200);
		expect(
			db
				.query(
					"select purpose, granted from customer_consents where customer_id = 1 order by id",
				)
				.all(),
		).toEqual([
			{ purpose: "privacy_notice", granted: 1 },
			{ purpose: "marketing_email", granted: 0 },
			{ purpose: "marketing_whatsapp", granted: 1 },
		]);
		expect(
			(
				await send("PUT", "/consents", {
					locale: "es",
					privacyNotice: false,
					marketingEmail: false,
					marketingWhatsapp: false,
				})
			).status,
		).toBe(400);
	});

	test("records each marketing choice against the privacy notice shown", async () => {
		const res = await send("PUT", "/consents", {
			locale: "en",
			marketingEmail: true,
			marketingWhatsapp: false,
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			consents: { marketingEmail: true, marketingWhatsapp: false },
		});
		await send("PUT", "/consents", {
			locale: "es",
			marketingEmail: false,
			marketingWhatsapp: false,
		});
		expect(
			db
				.query(
					"select purpose, granted, page_version_id, channel from customer_consents where customer_id = 1 order by id",
				)
				.all(),
		).toEqual([
			{
				purpose: "marketing_email",
				granted: 1,
				page_version_id: 1,
				channel: "web",
			},
			{
				purpose: "marketing_whatsapp",
				granted: 0,
				page_version_id: 1,
				channel: "web",
			},
			{
				purpose: "marketing_email",
				granted: 0,
				page_version_id: 1,
				channel: "web",
			},
			{
				purpose: "marketing_whatsapp",
				granted: 0,
				page_version_id: 1,
				channel: "web",
			},
		]);
	});
});

describe("addresses", () => {
	test("adds addresses in El Salvador, the default one first", async () => {
		const first = await send("POST", "/addresses", address);
		expect(first.status).toBe(201);
		expect(await first.json()).toMatchObject({
			...address,
			phone: "+50371234567",
			isDefault: false,
		});
		const second = await send("POST", "/addresses", {
			...address,
			department: "San Salvador",
			municipality: "San Salvador Centro",
			isDefault: true,
		});
		expect(second.status).toBe(201);
		const list = await json<Address[]>(await send("GET", "/addresses"));
		expect(list.map((a) => [a.municipality, a.isDefault])).toEqual([
			["San Salvador Centro", true],
			["La Libertad Sur", false],
		]);
	});

	test("refuses a municipality outside its department, an unknown place and a foreign phone", async () => {
		for (const place of [
			{ department: "San Salvador", municipality: "La Libertad Sur" },
			{ department: "Cuscatlán", municipality: "Cuscatlán Centro" },
			{ department: "Guatemala", municipality: "Guatemala Centro" },
		]) {
			const res = await send("POST", "/addresses", { ...address, ...place });
			expect(res.status).toBe(400);
		}
		const phone = await send("POST", "/addresses", {
			...address,
			phone: "+1 202 555 0123",
		});
		expect(phone.status).toBe(422);
		expect(
			(await send("PATCH", "/addresses/1", { department: "La Paz" })).status,
		).toBe(400);
	});

	test("moves the default, edits an address and archives it instead of deleting it", async () => {
		const a = await json<Address>(
			await send("POST", "/addresses", { ...address, isDefault: true }),
		);
		const b = await json<Address>(await send("POST", "/addresses", address));
		const moved = await send("POST", `/addresses/${b.id}/default`);
		expect(moved.status).toBe(200);
		expect(
			db
				.query("select id, is_default from customer_addresses order by id")
				.all(),
		).toEqual([
			{ id: a.id, is_default: 0 },
			{ id: b.id, is_default: 1 },
		]);
		const edited = await send("PATCH", `/addresses/${b.id}`, {
			department: "San Miguel",
			municipality: "San Miguel Centro",
			reference: null,
		});
		expect(await edited.json()).toMatchObject({
			municipality: "San Miguel Centro",
			reference: null,
			isDefault: true,
		});
		expect((await send("DELETE", `/addresses/${b.id}`)).status).toBe(200);
		expect(
			db
				.query("select status, is_default from customer_addresses where id = ?")
				.get(b.id),
		).toEqual({ status: "archived", is_default: 0 });
		const left = await json<Address[]>(await send("GET", "/addresses"));
		expect(left.map((x) => [x.id, x.isDefault])).toEqual([[a.id, false]]);
		expect(
			(await send("PATCH", `/addresses/${b.id}`, { reference: "x" })).status,
		).toBe(404);
		expect((await send("DELETE", `/addresses/${b.id}`)).status).toBe(404);
	});

	test("a customer never sees or changes another customer's address", async () => {
		const mine = await json<Address>(await send("POST", "/addresses", address));
		as("u-beto");
		expect(await json<unknown>(await send("GET", "/addresses"))).toEqual([]);
		expect(
			(await send("PATCH", `/addresses/${mine.id}`, { reference: "x" })).status,
		).toBe(404);
		expect((await send("POST", `/addresses/${mine.id}/default`)).status).toBe(
			404,
		);
		expect((await send("DELETE", `/addresses/${mine.id}`)).status).toBe(404);
		expect(
			db
				.query("select status, reference from customer_addresses where id = ?")
				.get(mine.id),
		).toEqual({ status: "active", reference: "Frente al parque" });
	});
});

describe("orders", () => {
	test("lists only the customer's own orders, with their status", async () => {
		const res = await send("GET", "/orders");
		expect(res.status).toBe(200);
		expect(await json<unknown>(res)).toEqual([
			{
				code: "NAG-1",
				status: "pending",
				subtotal: 0,
				discount: 0,
				shipping: 0,
				total: 0,
				createdAt: "2026-11-01T10:00:00Z",
				items: 0,
			},
		]);
	});

	test("shows an order with its status history, and another customer's order is a 404", async () => {
		db.exec(
			"update orders set status = 'cancelled', cancelled_at = '2026-11-03T10:00:00Z' where id = 1",
		);
		const res = await send("GET", "/orders/NAG-1");
		expect(res.status).toBe(200);
		const order = await json<{
			code: string;
			lines: unknown[];
			statusHistory: { from: string | null; to: string }[];
		}>(res);
		expect(order.code).toBe("NAG-1");
		expect(order.lines).toEqual([]);
		expect(order.statusHistory.map((h) => [h.from, h.to])).toEqual([
			[null, "pending"],
			["pending", "cancelled"],
		]);
		expect((await send("GET", "/orders/NAG-2")).status).toBe(404);
	});

	test("orders are read-only here", async () => {
		expect((await send("POST", "/orders", {})).status).toBe(404);
		expect((await send("DELETE", "/orders/NAG-1")).status).toBe(404);
	});
});

describe("reviews and wishlist", () => {
	beforeEach(() => {
		db.exec(`
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand');
insert into categories (slug, icon, sort_order) values ('c', 'package', 1);
insert into products (slug, brand_id, category_id) values ('kb', 1, 1), ('mouse', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado', 'teclado'), (2, 'es', 'Mouse', 'mouse');
insert into variants (product_id, sku, price, search_key) values (1, 'TEC-001', 1000, 'tec'), (2, 'RAT-001', 1000, 'rat');
update products set status = 'published';
insert into suppliers (name, search_key) values ('S', 's');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 5, 500);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 5, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 50000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 5, 'u');
${orderSql({ id: 3, customerId: 1, status: "delivered", lines: [{ variantId: 1, quantity: 1, unitPrice: 1000 }] })}
${orderSql({ id: 4, customerId: 2, status: "shipped", lines: [{ variantId: 1, quantity: 1, unitPrice: 1000 }] })}
`);
	});
	const review = { rating: 5, title: "Muy bueno", body: "Llegó rápido." };

	test("only the products of a delivered order can be reviewed, once, and an edit goes back to moderation", async () => {
		const list = await json<{ slug: string; review: unknown }[]>(
			await send("GET", "/reviews?locale=es"),
		);
		expect(list.map((p) => [p.slug, p.review])).toEqual([["kb", null]]);
		const saved = await send("PUT", "/reviews/kb", review);
		expect(saved.status).toBe(200);
		expect(await json<unknown>(saved)).toEqual({
			...review,
			status: "pending",
		});
		db.exec("update product_reviews set status = 'approved'");
		await send("PUT", "/reviews/kb", { ...review, rating: 4 });
		expect(
			db.query("select rating, status from product_reviews").all(),
		).toEqual([{ rating: 4, status: "pending" }]);
		const refused = await send("PUT", "/reviews/mouse", review);
		expect(refused.status).toBe(409);
		expect(await json<unknown>(refused)).toMatchObject({
			error: "review_requires_delivered_order",
		});
	});

	test("an order not yet delivered gives no right to review", async () => {
		as("u-beto");
		const res = await send("PUT", "/reviews/kb", review);
		expect(res.status).toBe(409);
	});

	test("the wishlist adds a product once and removes it", async () => {
		expect((await send("PUT", "/wishlist/kb")).status).toBe(200);
		expect((await send("PUT", "/wishlist/kb")).status).toBe(200);
		expect((await send("PUT", "/wishlist/nope")).status).toBe(404);
		const list = await json<{ slug: string }[]>(await send("GET", "/wishlist"));
		expect(list.map((w) => w.slug)).toEqual(["kb"]);
		await send("DELETE", "/wishlist/kb");
		expect(await json<unknown[]>(await send("GET", "/wishlist"))).toEqual([]);
	});
});
