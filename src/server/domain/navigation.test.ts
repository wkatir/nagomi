import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import { storeNavigation } from "./navigation";

// bun:sqlite has no batch, so its statements run in order.
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
INSERT INTO brands (slug, name, search_key) VALUES ('razer', 'Razer', 'razer'), ('akko', 'Akko', 'akko'), ('idle', 'Idle', 'idle');
INSERT INTO categories (slug, icon, sort_order) VALUES ('iluminacion', 'lightbulb', 6), ('ratones', 'mouse', 2), ('audifonos', 'headphones', 3);
INSERT INTO category_translations (category_id, locale, name, subtitle) VALUES (1, 'es', 'Iluminación', 'Para el escritorio'), (1, 'en', 'Lighting', NULL), (2, 'es', 'Ratones', NULL), (3, 'es', 'Audífonos', NULL);
INSERT INTO products (slug, brand_id, category_id) VALUES ('light-bar', 1, 1), ('viper', 1, 2), ('silent-mouse', 2, 2), ('headset', 2, 3);
INSERT INTO variants (product_id, sku, price, search_key) VALUES (1, 'LBR-001', 2200, 'lbr'), (2, 'VIP-001', 1800, 'vip'), (3, 'MOU-001', 1700, 'mou'), (4, 'HDS-001', 1500, 'hds');
INSERT INTO product_translations (product_id, locale, name, search_key) VALUES (1, 'es', 'Light Bar', 'light bar'), (2, 'es', 'Viper', 'viper'), (3, 'es', 'Silent Mouse', 'silent mouse'), (4, 'es', 'Headset', 'headset');
UPDATE products SET status = 'published' WHERE id IN (1, 2, 3);
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
			{
				slug: "ratones",
				name: "Ratones",
				productCount: 2,
				icon: "mouse",
				subtitle: null,
			},
			{
				slug: "iluminacion",
				name: "Iluminación",
				productCount: 1,
				icon: "lightbulb",
				subtitle: "Para el escritorio",
			},
		]);
		expect(nav.brands).toEqual([
			{ slug: "akko", name: "Akko", productCount: 1 },
			{ slug: "razer", name: "Razer", productCount: 2 },
		]);
		expect(nav.collections).toEqual([
			{ slug: "essentials", name: "Lo esencial", productCount: 2 },
			{ slug: "new", name: "Nuevo", productCount: 1 },
		]);
	});

	test("reads the page's locale, else the store's default", async () => {
		const nav = await storeNavigation(database(catalogue), context("en"));
		expect(nav.categories.map((c) => c.name)).toEqual(["Ratones", "Lighting"]);
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
			"Category ratones has no text in en or es",
		);
	});
});
