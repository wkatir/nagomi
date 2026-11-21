import { describe, expect, test } from "bun:test";
import {
	CATALOG_SORTS,
	type CatalogEntry,
	type CatalogFilter,
	type CatalogVariant,
	type FacetDimensions,
	queryCatalog,
	sortEntries,
	toCard,
} from "./catalog-query";
import { searchKey } from "./search";

const brands = {
	s1004: { slug: "skin1004", name: "SKIN1004" },
	fr: { slug: "face-republic", name: "Face Republic" },
};
const categories = {
	oil: { slug: "cleansing-oil", name: "Aceite limpiador", routineStep: 1 },
	cleanser: { slug: "cleanser", name: "Limpiador", routineStep: 2 },
	serum: { slug: "serum", name: "Sérum", routineStep: 4 },
	sunscreen: { slug: "sunscreen", name: "Protector solar", routineStep: 6 },
};
const concerns = {
	acne: { slug: "oily-acne", name: "Grasa y acné" },
	sensitive: { slug: "sensitive", name: "Piel sensible" },
	sun: { slug: "sun-protection", name: "Protección solar" },
	pores: { slug: "pores", name: "Poros" },
};

const variant = (
	sku: string,
	price: number,
	stock: boolean,
	extra: Partial<CatalogVariant> = {},
): CatalogVariant => ({
	sku,
	gtin: null,
	price,
	compareAtPrice: null,
	size: { value: 50, unit: "ml" },
	availability: stock ? "in_stock" : "sold_out",
	maxQuantity: stock ? 5 : 0,
	...extra,
});

let nextId = 1;
function entry(
	fields: Pick<CatalogEntry, "slug" | "name" | "brand" | "category"> &
		Partial<CatalogEntry>,
): CatalogEntry {
	const e: CatalogEntry = {
		id: nextId++,
		tagline: null,
		concerns: [],
		skinTypes: [],
		collections: [],
		routines: [],
		variants: [variant(`${fields.slug.toUpperCase()}`, 1000, false)],
		packshot: null,
		lifestyle: null,
		createdAt: "2026-10-05T12:00:00Z",
		searchText: "",
		...fields,
	};
	return {
		...e,
		searchText: searchKey(
			e.brand.name,
			e.name,
			e.category.name,
			...e.concerns.map((c) => c.name),
			...e.variants.map((v) => v.sku),
		),
	};
}

const oil = entry({
	slug: "light-cleansing-oil",
	name: "Light Cleansing Oil",
	brand: brands.s1004,
	category: categories.oil,
	concerns: [concerns.acne, concerns.sensitive],
	skinTypes: ["dry", "sensitive"],
	collections: [{ slug: "essentials", position: 1 }],
	variants: [variant("S1004-LCO-200", 2400, true)],
	createdAt: "2026-10-03T10:00:00Z",
});
const sunSerum = entry({
	slug: "water-fit-sun-serum",
	name: "Hyalu-Cica Water-Fit Sun Serum",
	brand: brands.s1004,
	category: categories.sunscreen,
	concerns: [concerns.sun, concerns.sensitive],
	collections: [
		{ slug: "essentials", position: 3 },
		{ slug: "new", position: 1 },
	],
	variants: [variant("S1004-WFSS-50", 2200, false)],
	createdAt: "2026-10-14T10:00:00Z",
});
const cleanser = entry({
	slug: "salicylic-cleanser",
	name: "Calming Salicylic Acid Cleanser",
	brand: brands.fr,
	category: categories.cleanser,
	concerns: [concerns.acne, concerns.pores, concerns.sensitive],
	skinTypes: ["oily", "combination", "sensitive"],
	collections: [{ slug: "essentials", position: 2 }],
	variants: [
		variant("FR-SAC-100", 1700, true),
		variant("FR-SAC-200", 2900, false, { size: { value: 200, unit: "ml" } }),
	],
	createdAt: "2026-10-03T10:00:00Z",
});
const sunEssence = entry({
	slug: "purity-sun-essence",
	name: "Purity Sun Essence",
	brand: brands.fr,
	category: categories.sunscreen,
	concerns: [concerns.sun],
	skinTypes: ["oily"],
	variants: [variant("FR-PSE-50", 1900, false, { compareAtPrice: 2300 })],
	createdAt: "2026-10-03T10:00:00Z",
});
const ampoule = entry({
	slug: "centella-ampoule",
	name: "Centella Ampoule",
	brand: brands.s1004,
	category: categories.serum,
	concerns: [concerns.sensitive],
	collections: [{ slug: "new", position: 2 }],
	variants: [variant("S1004-CA-100", 2500, false)],
	createdAt: "2026-10-14T10:00:00Z",
});
const entries = [oil, sunSerum, cleanser, sunEssence, ampoule];

const dimensions: FacetDimensions = {
	category: Object.values(categories),
	concern: Object.values(concerns),
	skinType: (
		["normal", "dry", "oily", "combination", "sensitive"] as const
	).map((slug) => ({ slug, name: slug })),
	brand: [brands.fr, brands.s1004],
	collection: [
		{ slug: "essentials", name: "Lo esencial" },
		{ slug: "new", name: "Recién llegados" },
		{ slug: "empty", name: "Sin productos" },
	],
};

const none: CatalogFilter = {
	category: [],
	concern: [],
	skinType: [],
	brand: [],
	collection: [],
	sort: "featured",
	page: 1,
	pageSize: 24,
};
const query = (f: Partial<CatalogFilter>) =>
	queryCatalog(entries, dimensions, { ...none, ...f }, "es");
const slugs = (r: ReturnType<typeof query>) => r.items.map((i) => i.slug);
const counts = (values: { slug: string; count: number }[]) =>
	Object.fromEntries(values.map((v) => [v.slug, v.count]));

describe("toCard", () => {
	test("shows the cheapest size in stock, the number of sizes and its stock", () => {
		const card = toCard(cleanser);
		expect(card).toMatchObject({
			sku: "FR-SAC-100",
			price: 1700,
			size: { value: 50, unit: "ml" },
			variantsCount: 2,
			availability: "in_stock",
			maxQuantity: 5,
			category: { slug: "cleanser", name: "Limpiador" },
		});
		expect(toCard(sunEssence)).toMatchObject({
			availability: "sold_out",
			maxQuantity: 0,
			compareAtPrice: 2300,
		});
	});

	test("skips a sold-out cheaper size, and shows the cheapest when all are sold out", () => {
		const sizes = (inStock: boolean) =>
			entry({
				slug: "toner",
				name: "Toner",
				brand: brands.fr,
				category: categories.cleanser,
				variants: [
					variant("T-100", 1500, false),
					variant("T-200", 2500, inStock),
				],
			});
		expect(toCard(sizes(true))).toMatchObject({
			sku: "T-200",
			price: 2500,
			availability: "in_stock",
			maxQuantity: 5,
		});
		expect(toCard(sizes(false))).toMatchObject({
			sku: "T-100",
			price: 1500,
			availability: "sold_out",
			maxQuantity: 0,
		});
	});
});

describe("queryCatalog", () => {
	test("without refinements lists everything, in stock first, then by routine step", () => {
		const r = query({});
		expect(r.total).toBe(5);
		expect(slugs(r)).toEqual([
			"light-cleansing-oil",
			"salicylic-cleanser",
			"centella-ampoule",
			// Same step, by name: Hyalu-Cica... before Purity...
			"water-fit-sun-serum",
			"purity-sun-essence",
		]);
		expect(r.priceRange).toEqual({ min: 1700, max: 2500 });
	});

	test("search ignores accents and case and needs every word", () => {
		expect(slugs(query({ q: "PROTECCIÓN" }))).toEqual([
			"water-fit-sun-serum",
			"purity-sun-essence",
		]);
		expect(slugs(query({ q: "skin1004 sun" }))).toEqual([
			"water-fit-sun-serum",
		]);
		expect(slugs(query({ q: "fr-sac" }))).toEqual(["salicylic-cleanser"]);
		expect(query({ q: "retinol" }).total).toBe(0);
		expect(query({ q: "   " }).total).toBe(5);
	});

	test("values of one facet are alternatives; facets narrow each other", () => {
		expect(
			slugs(query({ category: ["sunscreen", "cleanser"], sort: "name" })),
		).toEqual([
			"salicylic-cleanser",
			"water-fit-sun-serum",
			"purity-sun-essence",
		]);
		expect(
			slugs(query({ category: ["sunscreen"], brand: ["face-republic"] })),
		).toEqual(["purity-sun-essence"]);
		expect(slugs(query({ concern: ["pores", "sun-protection"] }))).toHaveLength(
			3,
		);
	});

	test("a facet's counts keep every other refinement but not its own", () => {
		const r = query({ category: ["sunscreen"], brand: ["skin1004"] });
		expect(slugs(r)).toEqual(["water-fit-sun-serum"]);
		// Categories counted among SKIN1004 products; brands among sunscreens.
		expect(counts(r.facets.category)).toEqual({
			"cleansing-oil": 1,
			cleanser: 0,
			serum: 1,
			sunscreen: 1,
		});
		expect(counts(r.facets.brand)).toEqual({
			"face-republic": 1,
			skin1004: 1,
		});
		expect(counts(r.facets.concern)).toEqual({
			"oily-acne": 0,
			sensitive: 1,
			"sun-protection": 1,
			pores: 0,
		});
		expect(
			r.facets.category.find((c) => c.slug === "sunscreen")?.selected,
		).toBe(true);
	});

	test("a product with several matching values counts once per value", () => {
		const r = query({});
		expect(counts(r.facets.concern)).toEqual({
			"oily-acne": 2,
			sensitive: 4,
			"sun-protection": 2,
			pores: 1,
		});
		expect(counts(r.facets.collection)).toEqual({ essentials: 3, new: 2 });
	});

	test("facets list the values found by the search and the selected ones", () => {
		const r = query({ q: "cleanser", collection: ["empty"] });
		expect(r.total).toBe(0);
		expect(r.facets.category.map((c) => c.slug)).toEqual(["cleanser"]);
		expect(r.facets.collection).toEqual([
			{ slug: "essentials", name: "Lo esencial", count: 1, selected: false },
			{ slug: "empty", name: "Sin productos", count: 0, selected: true },
		]);
	});

	test("price bounds are inclusive and the range ignores the price refinement", () => {
		const r = query({ minPrice: 1900, maxPrice: 2400 });
		expect(slugs(r).sort()).toEqual([
			"light-cleansing-oil",
			"purity-sun-essence",
			"water-fit-sun-serum",
		]);
		expect(r.priceRange).toEqual({ min: 1700, max: 2500 });
		expect(query({ category: ["sunscreen"] }).priceRange).toEqual({
			min: 1900,
			max: 2200,
		});
		expect(query({ q: "retinol" }).priceRange).toBeNull();
	});

	test("availability: in stock when any size has units, else sold out", () => {
		const r = query({ availability: "in_stock" });
		expect(slugs(r)).toEqual(["light-cleansing-oil", "salicylic-cleanser"]);
		expect(r.facets.availability).toEqual([
			{ value: "in_stock", count: 2, selected: true },
			{ value: "sold_out", count: 3, selected: false },
		]);
		expect(
			query({ availability: "sold_out", category: ["sunscreen"] }).facets
				.availability,
		).toEqual([
			{ value: "in_stock", count: 0, selected: false },
			{ value: "sold_out", count: 2, selected: true },
		]);
	});

	test("sorts by price, name and newest with stable ties", () => {
		// What is in stock is ordered first, then the sold-out ones in the same order.
		expect(slugs(query({ sort: "price_asc" }))).toEqual([
			"salicylic-cleanser",
			"light-cleansing-oil",
			"purity-sun-essence",
			"water-fit-sun-serum",
			"centella-ampoule",
		]);
		expect(slugs(query({ sort: "price_desc" }))).toEqual([
			"light-cleansing-oil",
			"salicylic-cleanser",
			"centella-ampoule",
			"water-fit-sun-serum",
			"purity-sun-essence",
		]);
		expect(slugs(query({ sort: "name" }))).toEqual([
			"salicylic-cleanser",
			"light-cleansing-oil",
			"centella-ampoule",
			"water-fit-sun-serum",
			"purity-sun-essence",
		]);
		// Same creation time: the later id first.
		expect(slugs(query({ sort: "newest" }))).toEqual([
			"salicylic-cleanser",
			"light-cleansing-oil",
			"centella-ampoule",
			"water-fit-sun-serum",
			"purity-sun-essence",
		]);
	});

	test("sold-out products go after every product in stock, whatever the sort", () => {
		for (const sort of CATALOG_SORTS) {
			const order = query({ sort }).items.map((i) => i.availability);
			expect(order, sort).toEqual([
				"in_stock",
				"in_stock",
				"sold_out",
				"sold_out",
				"sold_out",
			]);
		}
	});

	test("featured within one collection follows the collection's order", () => {
		expect(slugs(query({ collection: ["essentials"] }))).toEqual([
			"light-cleansing-oil",
			"salicylic-cleanser",
			"water-fit-sun-serum",
		]);
		expect(slugs(query({ collection: ["new"] }))).toEqual([
			"water-fit-sun-serum",
			"centella-ampoule",
		]);
		expect(
			sortEntries(
				entries.filter((e) => e.collections.some((c) => c.slug === "new")),
				"es",
				"featured",
				["new"],
			).map((e) => e.slug),
		).toEqual(["water-fit-sun-serum", "centella-ampoule"]);
	});

	test("skin types are alternatives, narrow the other facets and are counted without their own selection", () => {
		const r = query({ skinType: ["oily", "dry"] });
		expect(slugs(r)).toEqual([
			"light-cleansing-oil",
			"salicylic-cleanser",
			"purity-sun-essence",
		]);
		expect(counts(r.facets.skinType)).toEqual({
			dry: 1,
			oily: 2,
			combination: 1,
			sensitive: 2,
		});
		expect(
			r.facets.skinType.filter((v) => v.selected).map((v) => v.slug),
		).toEqual(["dry", "oily"]);
		expect(counts(r.facets.concern)).toEqual({
			"oily-acne": 2,
			sensitive: 2,
			pores: 1,
			"sun-protection": 1,
		});
	});

	test("the skin type facet lists only the values the matching products have, in the standard order", () => {
		const r = query({ q: "sun" });
		expect(r.facets.skinType.map((v) => v.slug)).toEqual(["oily"]);
		expect(query({}).facets.skinType.map((v) => v.slug)).toEqual([
			"dry",
			"oily",
			"combination",
			"sensitive",
		]);
	});

	test("pages through the results", () => {
		const first = query({ sort: "price_asc", pageSize: 2 });
		expect(first).toMatchObject({ total: 5, page: 1, pageCount: 3 });
		expect(slugs(first)).toEqual(["salicylic-cleanser", "light-cleansing-oil"]);
		expect(slugs(query({ sort: "price_asc", pageSize: 2, page: 3 }))).toEqual([
			"centella-ampoule",
		]);
		const beyond = query({ pageSize: 2, page: 9 });
		expect(beyond.items).toEqual([]);
		expect(beyond.total).toBe(5);
		expect(query({ q: "retinol" }).pageCount).toBe(1);
		expect(() => query({ page: 0 })).toThrow("Invalid page");
		expect(() => query({ pageSize: 0 })).toThrow("Invalid page size");
	});
});
