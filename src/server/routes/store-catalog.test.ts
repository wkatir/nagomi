import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { storeCatalog } = await import("./store-catalog");

const app = new Hono().route("/", storeCatalog);

type Routine = {
	slug: string;
	title: string;
	total: number;
	steps: { sku: string }[];
};
type Page = {
	slug: string;
	name: string;
	description: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
	productCount: number;
	routines: Routine[];
};
type CategoryPage = Omit<Page, "routines">;
type Listing = {
	items: { slug: string }[];
	total: number;
	facets: { skinType: { slug: string; count: number; selected: boolean }[] };
};
type Product = {
	variants: { sku: string; gtin: string | null }[];
	routines: Routine[];
};
const get = async <T>(path: string) => {
	const res = await app.request(path);
	return { status: res.status, body: (await res.json()) as T };
};

let db: Database;

// Two published products (p1: a cleanser for acne, p2: a serum for acne and pores) and a
// draft one (p3). The routine r-acne answers acne and is for sale; r-hidden also answers
// acne but has a step that is not for sale; r-other answers pores; r-draft is a draft.
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 180);
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, routine_step) values ('cleanser', 1), ('serum', 2), ('mask', 3);
insert into category_translations (category_id, locale, name, description, seo_title, seo_description) values
	(1, 'es', 'Limpiador', 'Van primero.', 'Limpiadores faciales', 'Compra limpiadores.'),
	(1, 'en', 'Cleanser', 'They go first.', null, null),
	(2, 'es', 'Sérum', null, null, null),
	(3, 'es', 'Mascarilla', null, null, null);
insert into concerns (slug, position) values ('acne', 0), ('pores', 1), ('dryness', 2);
insert into concern_translations (concern_id, locale, name, description, seo_title, seo_description) values
	(1, 'es', 'Acné', 'Para la piel con brillo.', 'Piel con acné', 'Productos para el acné.'),
	(1, 'en', 'Acne', 'For shiny skin.', null, null),
	(2, 'es', 'Poros', null, null, null),
	(3, 'es', 'Resequedad', null, null, null);
insert into products (slug, brand_id, category_id) values ('p1', 1, 1), ('p2', 1, 2), ('p3', 1, 3);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Producto 1', 'producto 1'), (2, 'es', 'Producto 2', 'producto 2'), (3, 'es', 'Producto 3', 'producto 3');
insert into variants (product_id, sku, price, search_key, gtin) values (1, 'P1', 1000, 'p1', '00012345678905'), (2, 'P2', 2000, 'p2', null), (3, 'P3', 3000, 'p3', null);
update products set status = 'published' where id in (1, 2);
insert into product_concerns (product_id, concern_id) values (1, 1), (2, 1), (2, 2), (3, 3);
insert into product_skin_types (product_id, skin_type) values (1, 'oily'), (1, 'combination'), (2, 'dry');
insert into routines (slug, status, concern_id) values ('r-acne', 'published', 1), ('r-hidden', 'published', 1), ('r-other', 'published', 2), ('r-draft', 'draft', 1);
insert into routine_translations (routine_id, locale, title) values (1, 'es', 'Rutina acné'), (2, 'es', 'Rutina oculta'), (3, 'es', 'Rutina poros'), (4, 'es', 'Borrador');
insert into routine_items (routine_id, variant_id, position) values (1, 1, 1), (1, 2, 2), (2, 1, 1), (2, 3, 2), (3, 2, 1), (4, 1, 1);
`);
	env.DB = d1(db);
});

describe("GET /concerns/:slug", () => {
	test("is the need's text, how many products it has and the routines that answer it", async () => {
		const { status, body } = await get<Page>("/concerns/acne?locale=es");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			slug: "acne",
			name: "Acné",
			description: "Para la piel con brillo.",
			seoTitle: "Piel con acné",
			seoDescription: "Productos para el acné.",
			productCount: 2,
		});
		expect(body.routines).toHaveLength(1);
		expect(body.routines[0]).toMatchObject({
			slug: "r-acne",
			title: "Rutina acné",
			total: 3000,
		});
		expect(body.routines[0].steps.map((s) => s.sku)).toEqual(["P1", "P2"]);
	});

	test("reads the text in the page's language, else in the store's", async () => {
		const english = await get<Page>("/concerns/acne?locale=en");
		expect(english.body).toMatchObject({
			name: "Acne",
			description: "For shiny skin.",
			seoTitle: null,
		});
		const fallback = await get<Page>("/concerns/pores?locale=en");
		expect(fallback.body).toMatchObject({ name: "Poros", description: null });
	});

	test("a need without a published product has no page", async () => {
		expect((await get("/concerns/dryness?locale=es")).status).toBe(404);
		expect((await get("/concerns/unknown?locale=es")).status).toBe(404);
	});

	test("an archived need has no page", async () => {
		db.exec("update concerns set status = 'archived' where slug = 'acne'");
		expect((await get("/concerns/acne?locale=es")).status).toBe(404);
	});

	test("a need no routine answers has an empty list", async () => {
		db.exec("update routines set concern_id = null");
		expect((await get<Page>("/concerns/acne?locale=es")).body.routines).toEqual(
			[],
		);
	});

	test("archiving a need removes its page but keeps its routines in the routine list", async () => {
		db.exec("update concerns set status = 'archived' where slug = 'pores'");
		const { body } = await get<Routine[]>("/routines?locale=es");
		expect(body.map((r) => r.slug).sort()).toEqual(["r-acne", "r-other"]);
		expect((await get("/concerns/pores?locale=es")).status).toBe(404);
	});
});

describe("GET /categories/:slug", () => {
	test("is the type's text and how many products it has", async () => {
		const { status, body } = await get<CategoryPage>(
			"/categories/cleanser?locale=es",
		);
		expect(status).toBe(200);
		expect(body).toEqual({
			slug: "cleanser",
			name: "Limpiador",
			description: "Van primero.",
			seoTitle: "Limpiadores faciales",
			seoDescription: "Compra limpiadores.",
			productCount: 1,
		});
		expect(
			(await get<CategoryPage>("/categories/cleanser?locale=en")).body
				.description,
		).toBe("They go first.");
	});

	test("a type with only a draft product has no page", async () => {
		expect((await get("/categories/mask?locale=es")).status).toBe(404);
		expect((await get("/categories/unknown?locale=es")).status).toBe(404);
	});
});

describe("GET /products", () => {
	const slugs = (body: Listing) => body.items.map((i) => i.slug);

	test("refines by skin type and counts the values left", async () => {
		const { status, body } = await get<Listing>(
			"/products?locale=es&skinType=oily&skinType=dry",
		);
		expect(status).toBe(200);
		expect(slugs(body).sort()).toEqual(["p1", "p2"]);
		expect(
			body.facets.skinType.map((v) => [v.slug, v.count, v.selected]),
		).toEqual([
			["dry", 1, true],
			["oily", 1, true],
			["combination", 1, false],
		]);
		expect(
			slugs((await get<Listing>("/products?locale=es&skinType=dry")).body),
		).toEqual(["p2"]);
	});

	test("refuses a skin type that does not exist", async () => {
		expect((await get("/products?locale=es&skinType=scaly")).status).toBe(400);
	});

	test("lists several needs as alternatives", async () => {
		const { body } = await get<Listing>(
			"/products?locale=es&concern=pores&concern=acne",
		);
		expect(slugs(body).sort()).toEqual(["p1", "p2"]);
		expect(
			(await get<Listing>("/products?locale=es&concern=pores")).body.total,
		).toBe(1);
	});
});

describe("GET /products/:slug", () => {
	test("has the routines it is in with their steps, and the sizes with their barcode", async () => {
		const { status, body } = await get<Product>("/products/p1?locale=es");
		expect(status).toBe(200);
		expect(body.variants[0]).toMatchObject({
			sku: "P1",
			gtin: "00012345678905",
		});
		expect(body.routines).toHaveLength(1);
		expect(body.routines[0]).toMatchObject({
			slug: "r-acne",
			title: "Rutina acné",
			total: 3000,
		});
		expect(body.routines[0].steps).toHaveLength(2);
	});
});
