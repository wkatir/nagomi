import { describe, expect, test } from "bun:test";
import { and, eq, exists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "#/db/schema";
import { migratedDatabase } from "#/db/test-database";
import { qualified } from "./d1";
import { searchKey } from "./search";
import { searchMatch } from "./search-sql";

const {
	brands,
	categories,
	products,
	productTranslations,
	suppliers,
	variants,
} = schema;

function seeded() {
	const db = drizzle(migratedDatabase(), { schema });
	db.insert(brands)
		.values({
			slug: "echo-audio",
			name: "Écho Audio",
			searchKey: searchKey("Écho Audio", "echo-audio"),
		})
		.run();
	db.insert(categories)
		.values({ slug: "teclados", icon: "keyboard", sortOrder: 1 })
		.run();
	db.insert(products)
		.values({ slug: "silent-mouse", brandId: 1, categoryId: 1 })
		.run();
	db.insert(productTranslations)
		.values({
			productId: 1,
			locale: "es",
			name: "Ratón Óptico Silencioso",
			searchKey: searchKey("Ratón Óptico Silencioso"),
		})
		.run();
	db.insert(variants)
		.values({
			productId: 1,
			sku: "TEC-030",
			gtin: "04006381333931",
			searchKey: searchKey("TEC-030", "04006381333931"),
		})
		.run();
	db.insert(suppliers)
		.values({
			name: "Distribuidora Ñandú",
			contactName: "Ángela Pérez",
			searchKey: searchKey("Distribuidora Ñandú", "Ángela Pérez"),
		})
		.run();
	return db;
}

describe("accent- and case-insensitive admin search", () => {
	const db = seeded();
	const productIds = (term: string) =>
		db
			.select({ id: products.id })
			.from(products)
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(
				productTranslations,
				eq(productTranslations.productId, products.id),
			)
			.where(
				and(
					searchMatch(term, [productTranslations.searchKey, brands.searchKey]),
				),
			)
			.all()
			.map((r) => r.id);
	const bySku = (term: string) =>
		db
			.select({ id: products.id })
			.from(products)
			.where(
				exists(
					db
						.select({ id: variants.id })
						.from(variants)
						.where(
							and(
								eq(variants.productId, qualified(products.id)),
								searchMatch(term, [variants.searchKey]),
							),
						),
				),
			)
			.all().length;

	test("products by name or brand", () => {
		for (const term of [
			"raton",
			"RATON",
			"Ratón",
			"optico silen",
			"echo",
			"ÉCHO",
		])
			expect(productIds(term)).toEqual([1]);
		expect(productIds("webcam")).toEqual([]);
	});

	test("products by SKU or barcode", () => {
		expect(bySku("tec-03")).toBe(1);
		expect(bySku("6381333931")).toBe(1);
		expect(bySku("XX-1")).toBe(0);
	});

	test("brands", () => {
		const found = (term: string) =>
			db
				.select()
				.from(brands)
				.where(searchMatch(term, [brands.searchKey]))
				.all().length;
		expect(found("ECHO")).toBe(1);
		expect(found("écho audio")).toBe(1);
		expect(found("echo-audio")).toBe(1);
		expect(found("lux")).toBe(0);
	});

	test("suppliers by name or contact", () => {
		const found = (term: string) =>
			db
				.select()
				.from(suppliers)
				.where(searchMatch(term, [suppliers.searchKey]))
				.all().length;
		for (const term of ["nandu", "ÑANDÚ", "angela", "PEREZ", "Ángela Pérez"])
			expect(found(term)).toBe(1);
		expect(found("maria")).toBe(0);
	});
});
