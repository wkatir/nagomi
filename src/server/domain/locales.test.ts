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
	products,
	productTranslations,
	variants,
} = schema;

describe("untranslated", () => {
	// Every row has Spanish text; English only where noted. One published product, in
	// "teclados".
	function seeded() {
		const db = drizzle(migratedDatabase(), { schema });
		db.insert(brands)
			.values({ slug: "akko", name: "Akko", searchKey: "akko" })
			.run();
		db.insert(categories)
			.values([
				{ slug: "teclados", icon: "keyboard", sortOrder: 1 },
				{ slug: "ratones", icon: "mouse", sortOrder: 2 },
				{ slug: "audifonos", icon: "headphones", sortOrder: 3 },
				{ slug: "retired", icon: "package", sortOrder: 4, status: "archived" },
			])
			.run();
		db.insert(categoryTranslations)
			.values([
				{ categoryId: 1, locale: "es", name: "Teclados" },
				{ categoryId: 2, locale: "es", name: "Ratones" },
				{ categoryId: 3, locale: "es", name: "Audífonos" },
				{ categoryId: 3, locale: "en", name: "Headphones" },
				{ categoryId: 4, locale: "es", name: "Retirada" },
			])
			.run();
		db.insert(products)
			.values({ slug: "sakura-65", brandId: 1, categoryId: 1 })
			.run();
		db.insert(productTranslations)
			.values([
				{ productId: 1, locale: "es", name: "Teclado", searchKey: "teclado" },
				{ productId: 1, locale: "en", name: "Keyboard", searchKey: "keyboard" },
			])
			.run();
		db.insert(variants)
			.values({
				productId: 1,
				sku: "TEC-002",
				price: 1551,
				searchKey: "tec-002",
			})
			.run();
		db.update(products)
			.set({ status: "published" })
			.where(eq(products.id, 1))
			.run();
		return db as unknown as Db;
	}

	const sorted = (rows: { type: string; slug: string }[]) =>
		[...rows].sort((a, b) =>
			`${a.type}:${a.slug}`.localeCompare(`${b.type}:${b.slug}`),
		);

	test("lists active categories, and archived ones a published product uses", async () => {
		const db = seeded();
		expect(sorted(await untranslated(db, "en"))).toEqual([
			{ type: "category", slug: "ratones" },
			{ type: "category", slug: "teclados" },
		]);
		expect(await untranslated(db, "es")).toEqual([]);
	});
});
