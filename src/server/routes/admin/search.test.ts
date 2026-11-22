import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { searchRouter } = await import("./search");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		c.set("staffRole", "admin");
		await next();
	})
	.route("/search", searchRouter);

type Hit = { id: number; label: string; hint: string | null };
const GROUPS = [
	"orders",
	"products",
	"customers",
	"suppliers",
	"purchases",
	"brands",
	"categories",
	"bundles",
	"collections",
	"promotions",
] as const;
type Results = Record<(typeof GROUPS)[number], Hit[]>;
const body = (res: Response): Promise<unknown> => res.json();
const search = async (q: string) => {
	const res = await app.request(`/search?q=${encodeURIComponent(q)}`);
	expect(res.status).toBe(200);
	return (await body(res)) as Results;
};
const labels = (hits: Hit[]) => hits.map((h) => h.label);
const none: Results = {
	orders: [],
	products: [],
	customers: [],
	suppliers: [],
	purchases: [],
	brands: [],
	bundles: [],
	categories: [],
	collections: [],
	promotions: [],
};

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5);
insert into customers (name, phone_e164, search_key) values ('Ángela Pérez', '+50371234567', 'angela perez 50371234567');
insert into orders (code, idempotency_key, request_hash, locale, channel, payment_method, shipping_method, confirmation_message, customer_email, customer_phone, subtotal, total, search_key, customer_id, customer_name) values ('NAG-1', 'k1', 'h', 'es', 'whatsapp', 'bank_transfer', 'pickup', 'm', 'angela@example.com', '+50371234567', 1000, 1000, 'nag-1', 1, 'Ángela Pérez');
insert into orders (code, idempotency_key, request_hash, locale, channel, payment_method, shipping_method, confirmation_message, customer_email, customer_phone, subtotal, total, search_key, customer_name) values ('NAG-2', 'k2', 'h', 'es', 'whatsapp', 'bank_transfer', 'pickup', 'm', 'maria@example.com', '+50379990000', 500, 500, 'nag-2 maria', 'Maria');
insert into brands (slug, name, search_key) values ('hyperx', 'HyperX', 'hyperx hyperx'), ('royal-kludge', 'Royal Kludge', 'royal kludge royal-kludge');
insert into categories (slug, icon, sort_order) values ('iluminacion', 'lightbulb', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Iluminación');
insert into products (slug, brand_id, category_id) values ('headset', 1, 1), ('raton', 2, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Audífonos inalámbricos', 'audifonos inalambricos'), (1, 'en', 'Wireless headset', 'wireless headset'), (2, 'es', 'Ratón', 'raton');
insert into variants (product_id, sku, search_key) values (1, 'AUD-200', 'aud-200'), (2, 'RAT-100', 'rat-100');
insert into suppliers (name, contact_name, search_key) values ('Nova Tech', 'Hana', 'nova tech hana');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-OCT', 'draft', '2026-10-01');
insert into promotions (code, type, value, status) values ('HOLA10', 'percentage', 10, 'active');
insert into bundles (slug, status, price) values ('diseno', 'draft', 1);
insert into bundle_translations (bundle_id, locale, name) values (1, 'es', 'Set de diseño');
insert into collections (slug, status) values ('summer', 'draft');
insert into collection_translations (collection_id, locale, title) values (1, 'es', 'Verano');
`);
	env.DB = d1(db);
});

describe("GET /search", () => {
	test("finds an order by its code, its customer or the name given with it, accents and case ignored", async () => {
		const byCustomer = (await search("ÁNGELA")).orders;
		expect(labels(byCustomer)).toEqual(["NAG-1"]);
		expect(byCustomer[0].hint).toBe("Ángela Pérez");
		expect(labels((await search("nag-2")).orders)).toEqual(["NAG-2"]);
		const byName = (await search("MARÍA")).orders;
		expect(labels(byName)).toEqual(["NAG-2"]);
		expect(byName[0].hint).toBe("Maria");
	});

	test("finds a phone by its digits however it is typed, in the customer and in their order", async () => {
		for (const q of ["7123 4567", "+503 7123-4567", "50371234567"]) {
			const found = await search(q);
			expect(labels(found.orders)).toEqual(["NAG-1"]);
			expect(labels(found.customers)).toEqual(["Ángela Pérez"]);
			expect(found.customers[0].hint).toBe("+50371234567");
		}
	});

	test("finds a product by its name, the SKU of a size or its brand, in the store's language", async () => {
		expect(labels((await search("RATON")).products)).toEqual(["Ratón"]);
		expect(labels((await search("aud-200")).products)).toEqual([
			"Audífonos inalámbricos",
		]);
		const byBrand = await search("hyperx");
		expect(byBrand.products.map((p) => [p.label, p.hint])).toEqual([
			["Audífonos inalámbricos", "HyperX"],
		]);
		expect(byBrand.brands.map((b) => b.label)).toEqual(["HyperX"]);
		expect((await search("wireless")).products).toEqual([]);
	});

	test("finds the records of every other module by what its own screen searches", async () => {
		expect(labels((await search("nova")).suppliers)).toEqual(["Nova Tech"]);
		expect(labels((await search("HANA")).suppliers)).toEqual(["Nova Tech"]);
		expect(labels((await search("royal klu")).brands)).toEqual([
			"Royal Kludge",
		]);
		expect(labels((await search("iluminacion")).categories)).toEqual([
			"Iluminación",
		]);
		expect(labels((await search("diseno")).bundles)).toEqual(["Set de diseño"]);
		expect(labels((await search("verano")).collections)).toEqual(["Verano"]);
		expect(labels((await search("hola")).promotions)).toEqual(["HOLA10"]);
		const purchase = (await search("po-oct")).purchases;
		expect(purchase.map((p) => [p.label, p.hint])).toEqual([
			["PO-OCT", "Nova Tech"],
		]);
	});

	test("answers every group, empty, when nothing matches", async () => {
		expect(await search("zzzz")).toEqual(none);
	});

	test("answers at most five of each kind, the newest orders first", async () => {
		for (let n = 3; n <= 9; n++)
			db.exec(
				`insert into orders (code, idempotency_key, request_hash, locale, channel, payment_method, shipping_method, confirmation_message, customer_email, customer_phone, subtotal, total, search_key, customer_name, created_at) values ('NAG-${n}', 'k${n}', 'h', 'es', 'whatsapp', 'bank_transfer', 'pickup', 'm', 'zeta@example.com', '+50379990000', 1, 1, 'nag-${n} zeta', 'Zeta', '2026-10-0${n}T10:00:00Z')`,
			);
		for (let n = 1; n <= 7; n++)
			db.exec(
				`insert into brands (slug, name, search_key) values ('zeta-${n}', 'Zeta ${n}', 'zeta ${n}')`,
			);
		const found = await search("zeta");
		expect(labels(found.orders)).toEqual([
			"NAG-9",
			"NAG-8",
			"NAG-7",
			"NAG-6",
			"NAG-5",
		]);
		expect(found.brands).toHaveLength(5);
	});

	test("refuses a missing, blank or oversized text", async () => {
		const tooLong = `/search?q=${"x".repeat(81)}`;
		for (const path of ["/search", "/search?q=", "/search?q=%20%20", tooLong]) {
			const res = await app.request(path);
			expect(res.status).toBe(400);
			expect(await body(res)).toMatchObject({ error: "invalid_request" });
		}
	});
});
