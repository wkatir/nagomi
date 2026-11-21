import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { searchRouter } = await import("./search");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
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
	"concerns",
	"routines",
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
	categories: [],
	concerns: [],
	routines: [],
	collections: [],
	promotions: [],
};

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 180);
insert into customers (name, phone_e164, search_key) values ('Ángela Pérez', '+50371234567', 'angela perez 50371234567');
insert into orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key, customer_id) values ('ECL-1', 'k1', 'h', 'es', 'whatsapp', 1000, 1000, 'ecl-1', 1);
insert into orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key, customer_name) values ('ECL-2', 'k2', 'h', 'es', 'whatsapp', 500, 500, 'ecl-2 maria', 'Maria');
insert into brands (slug, name, search_key) values ('skin1004', 'SKIN1004', 'skin1004 skin1004'), ('face-republic', 'Face Republic', 'face republic face-republic');
insert into categories (slug, routine_step) values ('cleanser', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Limpiador');
insert into concerns (slug) values ('sensitive');
insert into concern_translations (concern_id, locale, name) values (1, 'es', 'Piel sensible');
insert into products (slug, brand_id, category_id) values ('oil', 1, 1), ('toner', 2, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite limpiador', 'aceite limpiador'), (1, 'en', 'Cleansing oil', 'cleansing oil'), (2, 'es', 'Tónico', 'tonico');
insert into variants (product_id, sku, search_key) values (1, 'OIL-200', 'oil-200'), (2, 'TON-100', 'ton-100');
insert into suppliers (name, contact_name, search_key) values ('Sugar Glamour', 'Hana', 'sugar glamour hana');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-OCT', 'draft', '2026-10-01');
insert into promotions (code, type, value, status) values ('HOLA10', 'percentage', 10, 'active');
insert into routines (slug, status) values ('morning', 'draft');
insert into routine_translations (routine_id, locale, title) values (1, 'es', 'Rutina de mañana');
insert into collections (slug, status) values ('summer', 'draft');
insert into collection_translations (collection_id, locale, title) values (1, 'es', 'Verano');
`);
	env.DB = d1(db);
});

describe("GET /search", () => {
	test("finds an order by its code, its customer or the name given with it, accents and case ignored", async () => {
		const byCustomer = (await search("ÁNGELA")).orders;
		expect(labels(byCustomer)).toEqual(["ECL-1"]);
		expect(byCustomer[0].hint).toBe("Ángela Pérez");
		expect(labels((await search("ecl-2")).orders)).toEqual(["ECL-2"]);
		const byName = (await search("MARÍA")).orders;
		expect(labels(byName)).toEqual(["ECL-2"]);
		expect(byName[0].hint).toBe("Maria");
	});

	test("finds a phone by its digits however it is typed, in the customer and in their order", async () => {
		for (const q of ["7123 4567", "+503 7123-4567", "50371234567"]) {
			const found = await search(q);
			expect(labels(found.orders)).toEqual(["ECL-1"]);
			expect(labels(found.customers)).toEqual(["Ángela Pérez"]);
			expect(found.customers[0].hint).toBe("+50371234567");
		}
	});

	test("finds a product by its name, the SKU of a size or its brand, in the store's language", async () => {
		expect(labels((await search("TONICO")).products)).toEqual(["Tónico"]);
		expect(labels((await search("oil-200")).products)).toEqual([
			"Aceite limpiador",
		]);
		const byBrand = await search("skin1004");
		expect(byBrand.products.map((p) => [p.label, p.hint])).toEqual([
			["Aceite limpiador", "SKIN1004"],
		]);
		expect(byBrand.brands.map((b) => b.label)).toEqual(["SKIN1004"]);
		expect((await search("cleansing")).products).toEqual([]);
	});

	test("finds the records of every other module by what its own screen searches", async () => {
		expect(labels((await search("sugar")).suppliers)).toEqual([
			"Sugar Glamour",
		]);
		expect(labels((await search("HANA")).suppliers)).toEqual(["Sugar Glamour"]);
		expect(labels((await search("face rep")).brands)).toEqual([
			"Face Republic",
		]);
		expect(labels((await search("limpiador")).categories)).toEqual([
			"Limpiador",
		]);
		expect(labels((await search("PIEL")).concerns)).toEqual(["Piel sensible"]);
		expect(labels((await search("manana")).routines)).toEqual([
			"Rutina de mañana",
		]);
		expect(labels((await search("verano")).collections)).toEqual(["Verano"]);
		expect(labels((await search("hola")).promotions)).toEqual(["HOLA10"]);
		const purchase = (await search("po-oct")).purchases;
		expect(purchase.map((p) => [p.label, p.hint])).toEqual([
			["PO-OCT", "Sugar Glamour"],
		]);
	});

	test("answers every group, empty, when nothing matches", async () => {
		expect(await search("zzzz")).toEqual(none);
	});

	test("answers at most five of each kind, the newest orders first", async () => {
		for (let n = 3; n <= 9; n++)
			db.exec(
				`insert into orders (code, idempotency_key, request_hash, locale, channel, subtotal, total, search_key, customer_name, created_at) values ('ECL-${n}', 'k${n}', 'h', 'es', 'whatsapp', 1, 1, 'ecl-${n} zeta', 'Zeta', '2026-10-0${n}T10:00:00Z')`,
			);
		for (let n = 1; n <= 7; n++)
			db.exec(
				`insert into brands (slug, name, search_key) values ('zeta-${n}', 'Zeta ${n}', 'zeta ${n}')`,
			);
		const found = await search("zeta");
		expect(labels(found.orders)).toEqual([
			"ECL-9",
			"ECL-8",
			"ECL-7",
			"ECL-6",
			"ECL-5",
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
