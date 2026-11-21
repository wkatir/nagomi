import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import { untranslated } from "./locales";

const {
	brands,
	categories,
	categoryTranslations,
	concerns,
	concernTranslations,
	productConcerns,
	products,
	productTranslations,
	variants,
} = schema;

describe("untranslated", () => {
	// Every row has Spanish text; English only where noted. One published product (in
	// "cleanser", tagged with the archived concern "acne").
	function seeded() {
		const db = drizzle(migratedDatabase(), { schema });
		db.insert(brands)
			.values({ slug: "skin1004", name: "SKIN1004", searchKey: "skin1004" })
			.run();
		db.insert(categories)
			.values([
				{ slug: "cleanser", routineStep: 1 },
				{ slug: "mist", routineStep: 2 },
				{ slug: "toner", routineStep: 3 },
				{ slug: "retired", routineStep: 4, status: "archived" },
			])
			.run();
		db.insert(categoryTranslations)
			.values([
				{ categoryId: 1, locale: "es", name: "Limpiador" },
				{ categoryId: 2, locale: "es", name: "Bruma" },
				{ categoryId: 3, locale: "es", name: "Tónico" },
				{ categoryId: 3, locale: "en", name: "Toner" },
				{ categoryId: 4, locale: "es", name: "Retirada" },
			])
			.run();
		db.insert(concerns)
			.values([
				{ slug: "pores" },
				{ slug: "hydration" },
				{ slug: "old", status: "archived" },
				{ slug: "acne", status: "archived" },
			])
			.run();
		db.insert(concernTranslations)
			.values([
				{ concernId: 1, locale: "es", name: "Poros" },
				{ concernId: 2, locale: "es", name: "Hidratación" },
				{ concernId: 2, locale: "en", name: "Hydration" },
				{ concernId: 3, locale: "es", name: "Vieja" },
				{ concernId: 4, locale: "es", name: "Acné" },
			])
			.run();
		db.insert(products)
			.values({ slug: "oil", brandId: 1, categoryId: 1 })
			.run();
		db.insert(productTranslations)
			.values([
				{ productId: 1, locale: "es", name: "Aceite", searchKey: "aceite" },
				{ productId: 1, locale: "en", name: "Oil", searchKey: "oil" },
			])
			.run();
		db.insert(variants)
			.values({ productId: 1, sku: "OIL", price: 1551, searchKey: "oil" })
			.run();
		db.update(products)
			.set({ status: "published" })
			.where(eq(products.id, 1))
			.run();
		db.insert(productConcerns).values({ productId: 1, concernId: 4 }).run();
		return db as unknown as Db;
	}

	const sorted = (rows: { type: string; slug: string }[]) =>
		[...rows].sort((a, b) =>
			`${a.type}:${a.slug}`.localeCompare(`${b.type}:${b.slug}`),
		);

	test("lists active categories and concerns, and archived ones a published product uses", async () => {
		const db = seeded();
		expect(sorted(await untranslated(db, "en"))).toEqual([
			{ type: "category", slug: "cleanser" },
			{ type: "category", slug: "mist" },
			{ type: "concern", slug: "acne" },
			{ type: "concern", slug: "pores" },
		]);
		expect(await untranslated(db, "es")).toEqual([]);
	});
});
