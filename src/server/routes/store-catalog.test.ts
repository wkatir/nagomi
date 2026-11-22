import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { storeCatalog } = await import("./store-catalog");

const app = new Hono().route("/", storeCatalog);

type Bundle = {
	slug: string;
	name: string;
	price: number;
	itemsTotal: number;
	saving: number;
	items: { sku: string; quantity: number }[];
};
type CategoryPage = {
	slug: string;
	name: string;
	subtitle: string | null;
	icon: string;
	description: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
	productCount: number;
};
type Listing = {
	items: { slug: string; shortSpecs: string | null; badge: string | null }[];
	total: number;
	facets: { brand: { slug: string; count: number; selected: boolean }[] };
};
type Product = {
	shortSpecs: string | null;
	warrantyMonths: number;
	badge: string | null;
	specs: { label: string; value: string }[];
	variants: { sku: string; gtin: string | null; optionLabel: string | null }[];
	bundles: Bundle[];
};
type Home = {
	featuredBundles: Bundle[];
	featuredProducts: { slug: string }[];
	categories: { slug: string }[];
};
const get = async <T>(path: string) => {
	const res = await app.request(path);
	return { status: res.status, body: (await res.json()) as T };
};

let db: Database;

// Two published keyboards (p1 by Akko, p2 by Royal Kludge, featured) and a draft mouse
// (p3). The bundle set-a is for sale; set-draft is a draft.
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Nagomi', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5);
insert into brands (slug, name, search_key) values ('akko', 'Akko', 'akko'), ('royal-kludge', 'Royal Kludge', 'royal kludge');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1), ('ratones', 'mouse', 2);
insert into category_translations (category_id, locale, name, subtitle, description, seo_title, seo_description) values (1, 'es', 'Teclados', 'Mecánicos y custom', 'Para escribir y jugar.', 'Teclados mecánicos', 'Compra teclados.'), (1, 'en', 'Keyboards', 'Mechanical and custom', 'To type and play.', null, null), (2, 'es', 'Ratones', null, null, null, null);
insert into products (slug, brand_id, category_id, warranty_months, is_featured, badge) values ('p1', 1, 1, 12, 0, null), ('p2', 2, 1, 12, 1, 'best_seller'), ('p3', 1, 2, 12, 0, null);
insert into product_translations (product_id, locale, name, search_key, short_specs) values (1, 'es', 'Teclado Sakura', 'teclado sakura', '65% · Hot-swap'), (2, 'es', 'Teclado RK75', 'teclado rk75', '75% · RGB'), (3, 'es', 'Mouse Hana', 'mouse hana', null);
insert into product_specs (id, product_id, position) values (1, 1, 2), (2, 1, 1);
insert into product_spec_translations (spec_id, locale, label, value) values (1, 'es', 'Switches', 'Hot-swap'), (2, 'es', 'Formato', '65%'), (2, 'en', 'Layout', '65%');
insert into variants (product_id, sku, price, search_key, gtin, option_label) values (1, 'TEC-002', 7499, 'tec-002', '00012345678905', 'Rosa'), (2, 'TEC-001', 8999, 'tec-001', null, null), (3, 'RAT-002', 2499, 'rat-002', null, null);
update products set status = 'published' where id in (1, 2);
insert into bundles (slug, price, is_featured) values ('set-a', 15000, 1), ('set-draft', 100, 0);
insert into bundle_translations (bundle_id, locale, name) values (1, 'es', 'Set A'), (2, 'es', 'Borrador');
insert into bundle_items (bundle_id, variant_id, quantity, position) values (1, 1, 1, 1), (1, 2, 1, 2), (2, 1, 1, 1), (2, 3, 1, 2);
update bundles set status = 'published' where slug = 'set-a';
`);
	env.DB = d1(db);
});

describe("GET /categories/:slug", () => {
	test("is the category's text, its tile, and how many products it has", async () => {
		const { status, body } = await get<CategoryPage>(
			"/categories/teclados?locale=es",
		);
		expect(status).toBe(200);
		expect(body).toEqual({
			slug: "teclados",
			name: "Teclados",
			subtitle: "Mecánicos y custom",
			icon: "keyboard",
			description: "Para escribir y jugar.",
			seoTitle: "Teclados mecánicos",
			seoDescription: "Compra teclados.",
			productCount: 2,
		});
		expect(
			(await get<CategoryPage>("/categories/teclados?locale=en")).body,
		).toMatchObject({
			description: "To type and play.",
			subtitle: "Mechanical and custom",
		});
	});

	test("a category with only a draft product has no page", async () => {
		expect((await get("/categories/ratones?locale=es")).status).toBe(404);
		expect((await get("/categories/unknown?locale=es")).status).toBe(404);
	});
});

describe("GET /products", () => {
	const slugs = (body: Listing) => body.items.map((i) => i.slug);

	test("refines by brand, counts the values left, and shows the card line and badge", async () => {
		const { status, body } = await get<Listing>(
			"/products?locale=es&brand=akko",
		);
		expect(status).toBe(200);
		expect(slugs(body)).toEqual(["p1"]);
		expect(body.items[0]).toMatchObject({
			shortSpecs: "65% · Hot-swap",
			badge: null,
		});
		expect(body.facets.brand.map((v) => [v.slug, v.count, v.selected])).toEqual(
			[
				["akko", 1, true],
				["royal-kludge", 1, false],
			],
		);
	});

	test("puts the featured products first", async () => {
		const { body } = await get<Listing>("/products?locale=es");
		expect(slugs(body)).toEqual(["p2", "p1"]);
		expect(body.items[0].badge).toBe("best_seller");
	});
});

describe("GET /products/:slug", () => {
	test("has its specs in order, its warranty, the variants with their option and the bundles it is in", async () => {
		const { status, body } = await get<Product>("/products/p1?locale=en");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			shortSpecs: "65% · Hot-swap",
			warrantyMonths: 12,
			specs: [
				{ label: "Layout", value: "65%" },
				{ label: "Switches", value: "Hot-swap" },
			],
		});
		expect(body.variants[0]).toMatchObject({
			sku: "TEC-002",
			gtin: "00012345678905",
			optionLabel: "Rosa",
		});
		expect(body.bundles).toHaveLength(1);
		expect(body.bundles[0]).toMatchObject({
			slug: "set-a",
			name: "Set A",
			price: 15000,
			itemsTotal: 7499 + 8999,
			saving: 7499 + 8999 - 15000,
		});
	});
});

describe("GET /bundles", () => {
	test("lists the published bundles with their price, the sum of their items and the saving", async () => {
		const { body } = await get<Bundle[]>("/bundles?locale=es");
		expect(body.map((b) => b.slug)).toEqual(["set-a"]);
		expect(body[0].items.map((i) => [i.sku, i.quantity])).toEqual([
			["TEC-002", 1],
			["TEC-001", 1],
		]);
		expect((await get<Bundle>("/bundles/set-a?locale=es")).body.saving).toBe(
			1498,
		);
		expect((await get("/bundles/set-draft?locale=es")).status).toBe(404);
	});
});

describe("GET /home", () => {
	test("has the featured bundles and products and the categories in their order", async () => {
		const { body } = await get<Home>("/home?locale=es");
		expect(body.featuredBundles.map((b) => b.slug)).toEqual(["set-a"]);
		expect(body.featuredProducts.map((p) => p.slug)).toEqual(["p2"]);
		expect(body.categories.map((c) => c.slug)).toEqual(["teclados"]);
	});
});
