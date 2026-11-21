import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import { storeNavigation } from "./navigation";

// D1 runs a batch as one transaction; bun:sqlite has no batch, so its statements run in
// order here.
function database(sql: string) {
	const raw = migratedDatabase();
	raw.exec(sql);
	const db = drizzle(raw, { schema });
	return Object.assign(db, {
		batch: async (statements: { all: () => unknown }[]) =>
			statements.map((s) => s.all()),
	}) as unknown as Db;
}

const catalogue = `
INSERT INTO brands (slug, name, search_key) VALUES ('skin1004', 'SKIN1004', 'skin1004'), ('face-republic', 'Face Republic', 'face'), ('idle', 'Idle', 'idle');
INSERT INTO categories (slug, routine_step) VALUES ('sunscreen', 6), ('cleanser', 2), ('toner', 3);
INSERT INTO category_translations (category_id, locale, name) VALUES (1, 'es', 'Protector solar'), (1, 'en', 'Sunscreen'), (2, 'es', 'Limpiador'), (3, 'es', 'Tónico');
INSERT INTO concerns (slug, position) VALUES ('pores', 2), ('sensitive', 1), ('retired', 0);
INSERT INTO concern_translations (concern_id, locale, name) VALUES (1, 'es', 'Poros'), (2, 'es', 'Piel sensible'), (2, 'en', 'Sensitive skin'), (3, 'es', 'Vieja');
INSERT INTO products (slug, brand_id, category_id) VALUES ('sun', 1, 1), ('foam', 1, 2), ('cleanser', 2, 2), ('toner', 2, 3);
INSERT INTO variants (product_id, sku, price, search_key) VALUES (1, 'SUN', 2200, 'sun'), (2, 'FOAM', 1800, 'foam'), (3, 'CLN', 1700, 'cln'), (4, 'TON', 1500, 'ton');
INSERT INTO product_translations (product_id, locale, name, search_key) VALUES (1, 'es', 'Sun', 'sun'), (2, 'es', 'Foam', 'foam'), (3, 'es', 'Cleanser', 'cleanser'), (4, 'es', 'Toner', 'toner');
INSERT INTO product_concerns (product_id, concern_id) VALUES (1, 2), (2, 1), (2, 2), (3, 1), (3, 3), (4, 1);
UPDATE products SET status = 'published' WHERE id IN (1, 2, 3);
UPDATE concerns SET status = 'archived' WHERE id = 3;
INSERT INTO collections (slug, status, position) VALUES ('essentials', 'published', 2), ('soon', 'published', 1), ('draft', 'draft', 0), ('new', 'published', 3);
INSERT INTO collection_translations (collection_id, locale, title) VALUES (1, 'es', 'Lo esencial'), (1, 'en', 'The essentials'), (2, 'es', 'Pronto'), (3, 'es', 'Borrador'), (4, 'es', 'Nuevo');
INSERT INTO collection_products (collection_id, product_id, position) VALUES (1, 1, 1), (1, 3, 2), (2, 4, 1), (3, 1, 1), (4, 2, 1);
`;

const context = (locale: "es" | "en") => ({
	locale,
	fallback: "es" as const,
	today: "2026-10-16",
	holdStart: "2026-10-15T06:00:00Z",
	maxQuantityPerLine: 20,
});

describe("storeNavigation", () => {
	test("lists what has published products, with counts, in the store's order", async () => {
		const nav = await storeNavigation(database(catalogue), context("es"));
		expect(nav.categories).toEqual([
			{ slug: "cleanser", name: "Limpiador", productCount: 2 },
			{ slug: "sunscreen", name: "Protector solar", productCount: 1 },
		]);
		expect(nav.concerns).toEqual([
			{ slug: "sensitive", name: "Piel sensible", productCount: 2 },
			{ slug: "pores", name: "Poros", productCount: 2 },
		]);
		expect(nav.brands).toEqual([
			{ slug: "face-republic", name: "Face Republic", productCount: 1 },
			{ slug: "skin1004", name: "SKIN1004", productCount: 2 },
		]);
		expect(nav.collections).toEqual([
			{ slug: "essentials", name: "Lo esencial", productCount: 2 },
			{ slug: "new", name: "Nuevo", productCount: 1 },
		]);
	});

	test("reads the page's locale, else the store's default", async () => {
		const nav = await storeNavigation(database(catalogue), context("en"));
		expect(nav.categories.map((c) => c.name)).toEqual([
			"Limpiador",
			"Sunscreen",
		]);
		expect(nav.concerns.map((c) => c.name)).toEqual([
			"Sensitive skin",
			"Poros",
		]);
		expect(nav.collections.map((c) => c.name)).toEqual([
			"The essentials",
			"Nuevo",
		]);
	});

	test("fails loudly when a listed value has no text", async () => {
		const db = database(
			`${catalogue}\nDELETE FROM category_translations WHERE category_id = 2;`,
		);
		await expect(storeNavigation(db, context("en"))).rejects.toThrow(
			"Category cleanser has no text in en or es",
		);
	});
});
