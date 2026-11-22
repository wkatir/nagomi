import { describe, expect, test } from "bun:test";
import type { CatalogEntry, CatalogVariant } from "./catalog-query";
import { relatedProducts } from "./related";

const variant = (sku: string, inStock: boolean): CatalogVariant => ({
	sku,
	gtin: null,
	optionLabel: null,
	price: 1000,
	compareAtPrice: null,
	availability: inStock ? "in_stock" : "sold_out",
	maxQuantity: inStock ? 5 : 0,
});

let nextId = 1;
const entry = (
	slug: string,
	category: string,
	sortOrder: number,
	brand: string,
	extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
	id: nextId++,
	rating: { average: null, count: 0 },
	slug,
	name: slug,
	tagline: null,
	shortSpecs: null,
	isFeatured: false,
	badge: null,
	warrantyMonths: 12,
	brand: { slug: brand, name: brand },
	category: { slug: category, name: category, sortOrder },
	collections: [],
	bundles: [],
	variants: [variant(slug.toUpperCase(), false)],
	packshot: null,
	lifestyle: null,
	createdAt: "2026-10-01T00:00:00Z",
	searchText: slug,
	...extra,
});

const slugs = (r: ReturnType<typeof relatedProducts>) =>
	r.map((x) => x.entry.slug);

describe("relatedProducts", () => {
	const keyboard = entry("rk75", "teclados", 1, "royal-kludge", {
		bundles: ["set-streaming"],
	});
	const mouse = entry("pulsar-x2", "ratones", 2, "pulsar", {
		bundles: ["set-streaming"],
	});
	const otherKeyboard = entry("sakura-65", "teclados", 1, "akko");
	const sameBrand = entry("kuro-60", "teclados", 1, "royal-kludge");
	const mat = entry("gran-ola", "alfombrillas", 3, "nagomi", {
		bundles: ["set-streaming"],
	});
	const light = entry("barra-rgb", "iluminacion", 5, "luminex");

	test("never lists the product itself", () => {
		expect(slugs(relatedProducts(keyboard, [keyboard, mouse]))).toEqual([
			"pulsar-x2",
		]);
	});

	test("ranks products of the same bundle first, then the same category and brand", () => {
		const r = relatedProducts(keyboard, [
			light,
			otherKeyboard,
			sameBrand,
			mat,
			mouse,
		]);
		expect(slugs(r)).toEqual([
			"pulsar-x2",
			"gran-ola",
			"kuro-60",
			"sakura-65",
			"barra-rgb",
		]);
		expect(r.map((x) => x.relation)).toEqual([
			"complement",
			"complement",
			"alternative",
			"alternative",
			"complement",
		]);
	});

	test("keeps at most two per category while others are left, then fills", () => {
		const keyboards = [1, 2, 3, 4].map((n) =>
			entry(`teclado-${n}`, "teclados", 1, "akko"),
		);
		const r = relatedProducts(keyboard, [...keyboards, mat, light], 8);
		expect(slugs(r)).toEqual([
			"gran-ola",
			"teclado-1",
			"teclado-2",
			"barra-rgb",
			"teclado-3",
			"teclado-4",
		]);
		expect(slugs(relatedProducts(keyboard, [...keyboards, mat], 3))).toEqual([
			"gran-ola",
			"teclado-1",
			"teclado-2",
		]);
	});

	test("puts products in stock first among equals", () => {
		const inStock = entry("en-stock", "iluminacion", 5, "luminex", {
			variants: [variant("ILU-009", true)],
		});
		expect(slugs(relatedProducts(keyboard, [light, inStock]))).toEqual([
			"en-stock",
			"barra-rgb",
		]);
	});

	test("returns at most the limit", () => {
		const many = Array.from({ length: 20 }, (_, n) =>
			entry(`p-${n}`, `c-${n}`, 2, "akko"),
		);
		expect(relatedProducts(keyboard, many)).toHaveLength(8);
	});
});
