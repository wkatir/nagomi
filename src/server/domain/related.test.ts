import { describe, expect, test } from "bun:test";
import type { CatalogEntry } from "./catalog-query";
import { relatedProducts } from "./related";

let nextId = 1;
const entry = (
	slug: string,
	category: string,
	routineStep: number,
	concerns: string[],
	extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
	id: nextId++,
	slug,
	name: slug,
	tagline: null,
	brand: { slug: "b", name: "B" },
	category: { slug: category, name: category, routineStep },
	concerns: concerns.map((c) => ({ slug: c, name: c })),
	skinTypes: [],
	collections: [],
	routines: [],
	variants: [
		{
			sku: slug.toUpperCase(),
			gtin: null,
			price: 1000,
			compareAtPrice: null,
			size: null,
			availability: "sold_out",
			maxQuantity: 0,
		},
	],
	packshot: null,
	lifestyle: null,
	createdAt: "2026-10-01T00:00:00Z",
	searchText: slug,
	...extra,
});

const slugs = (r: ReturnType<typeof relatedProducts>) =>
	r.map((x) => x.entry.slug);

describe("relatedProducts", () => {
	const oil = entry("oil", "cleansing-oil", 1, ["acne", "sensitive"], {
		routines: ["double-cleanse"],
	});
	const cleanser = entry("cleanser", "cleanser", 2, ["acne", "pores"], {
		routines: ["double-cleanse"],
	});
	const otherOil = entry("other-oil", "cleansing-oil", 1, ["dryness"]);
	const toner = entry("toner", "toner", 3, ["sensitive"]);
	const sunscreen = entry("sunscreen", "sunscreen", 6, [], {
		routines: ["double-cleanse"],
	});
	const balm = entry("balm", "cleansing-balm", 1, ["dryness"]);

	test("never lists the product itself", () => {
		expect(slugs(relatedProducts(oil, [oil, cleanser]))).toEqual(["cleanser"]);
	});

	test("ranks steps of the same routine, then shared concerns, then category or step", () => {
		const r = relatedProducts(oil, [oil, otherOil, toner, sunscreen, cleanser]);
		// cleanser: routine 4 + one concern 2 + other step 1 = 7; sunscreen: 4 + 1 = 5;
		// toner: 2 + 1 = 3; other oil: same category 1.
		expect(slugs(r)).toEqual(["cleanser", "sunscreen", "toner", "other-oil"]);
		expect(r.map((x) => x.relation)).toEqual([
			"complement",
			"complement",
			"complement",
			"alternative",
		]);
	});

	test("leaves out a product of the same step with nothing in common", () => {
		expect(slugs(relatedProducts(oil, [balm, toner]))).toEqual(["toner"]);
	});

	test("keeps at most two per category while others are left, then fills", () => {
		const toners = [1, 2, 3, 4].map((n) =>
			entry(`toner-${n}`, "toner", 3, ["acne", "sensitive"]),
		);
		const r = relatedProducts(oil, [...toners, sunscreen, otherOil], 8);
		expect(slugs(r)).toEqual([
			"toner-1",
			"toner-2",
			"sunscreen",
			"other-oil",
			"toner-3",
			"toner-4",
		]);
		expect(slugs(relatedProducts(oil, [...toners, sunscreen], 3))).toEqual([
			"toner-1",
			"toner-2",
			"sunscreen",
		]);
	});

	test("puts products in stock first among equals", () => {
		const inStock = entry("in-stock", "toner", 3, ["sensitive"], {
			variants: [
				{
					sku: "IN",
					gtin: null,
					price: 1000,
					compareAtPrice: null,
					size: null,
					availability: "in_stock",
					maxQuantity: 5,
				},
			],
		});
		expect(slugs(relatedProducts(oil, [toner, inStock]))).toEqual([
			"in-stock",
			"toner",
		]);
	});

	test("returns at most the limit", () => {
		const many = Array.from({ length: 20 }, (_, n) =>
			entry(`p-${n}`, `c-${n}`, 2, ["acne"]),
		);
		expect(relatedProducts(oil, many)).toHaveLength(8);
	});
});
