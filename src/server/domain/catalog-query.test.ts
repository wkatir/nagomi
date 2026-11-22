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
	razer: { slug: "razer", name: "Razer" },
	akko: { slug: "akko", name: "Akko" },
};
const categories = {
	keyboards: { slug: "teclados", name: "Teclados", sortOrder: 1 },
	mice: { slug: "ratones", name: "Ratones", sortOrder: 2 },
	deskMats: { slug: "alfombrillas", name: "Alfombrillas", sortOrder: 4 },
	lighting: { slug: "iluminacion", name: "Iluminación", sortOrder: 6 },
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
	optionLabel: null,
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
		rating: { average: null, count: 0 },
		tagline: null,
		shortSpecs: null,
		isFeatured: false,
		badge: null,
		warrantyMonths: 12,
		collections: [],
		bundles: [],
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
			...e.variants.map((v) => v.sku),
		),
	};
}

const keyboard = entry({
	slug: "low-profile-keyboard",
	name: "Low Profile Keyboard",
	brand: brands.razer,
	category: categories.keyboards,
	collections: [{ slug: "essentials", position: 1 }],
	variants: [variant("RZR-LPK-200", 2400, true)],
	createdAt: "2026-10-03T10:00:00Z",
});
const lightBar = entry({
	slug: "halo-rgb-light-bar",
	name: "Halo RGB Light Bar",
	brand: brands.razer,
	category: categories.lighting,
	collections: [
		{ slug: "essentials", position: 3 },
		{ slug: "new", position: 1 },
	],
	variants: [variant("RZR-HLB-50", 2200, false)],
	createdAt: "2026-10-14T10:00:00Z",
});
const mouse = entry({
	slug: "ergonomic-silent-mouse",
	name: "Ergonomic Silent Mouse",
	brand: brands.akko,
	category: categories.mice,
	collections: [{ slug: "essentials", position: 2 }],
	variants: [
		variant("AKK-ESM-100", 1700, true),
		variant("AKK-ESM-200", 2900, false, { optionLabel: "Inalámbrico" }),
	],
	createdAt: "2026-10-03T10:00:00Z",
});
const lamp = entry({
	slug: "prism-rgb-desk-lamp",
	name: "Prism RGB Desk Lamp",
	brand: brands.akko,
	category: categories.lighting,
	variants: [variant("AKK-PDL-50", 1900, false, { compareAtPrice: 2300 })],
	createdAt: "2026-10-03T10:00:00Z",
});
const deskMat = entry({
	slug: "gaming-desk-mat",
	name: "Gaming Desk Mat",
	brand: brands.razer,
	category: categories.deskMats,
	collections: [{ slug: "new", position: 2 }],
	variants: [variant("RZR-GDM-100", 2500, false)],
	createdAt: "2026-10-14T10:00:00Z",
});
const entries = [keyboard, lightBar, mouse, lamp, deskMat];

const dimensions: FacetDimensions = {
	category: Object.values(categories),
	brand: [brands.akko, brands.razer],
	collection: [
		{ slug: "essentials", name: "Lo esencial" },
		{ slug: "new", name: "Recién llegados" },
		{ slug: "empty", name: "Sin productos" },
	],
};

const none: CatalogFilter = {
	category: [],
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
		const card = toCard(mouse);
		expect(card).toMatchObject({
			sku: "AKK-ESM-100",
			price: 1700,
			optionLabel: null,
			variantsCount: 2,
			availability: "in_stock",
			maxQuantity: 5,
			category: { slug: "ratones", name: "Ratones" },
		});
		expect(toCard(lamp)).toMatchObject({
			availability: "sold_out",
			maxQuantity: 0,
			compareAtPrice: 2300,
		});
	});

	test("skips a sold-out cheaper size, and shows the cheapest when all are sold out", () => {
		const sizes = (inStock: boolean) =>
			entry({
				slug: "wired-mouse",
				name: "Wired Mouse",
				brand: brands.akko,
				category: categories.mice,
				variants: [
					variant("M-100", 1500, false),
					variant("M-200", 2500, inStock),
				],
			});
		expect(toCard(sizes(true))).toMatchObject({
			sku: "M-200",
			price: 2500,
			availability: "in_stock",
			maxQuantity: 5,
		});
		expect(toCard(sizes(false))).toMatchObject({
			sku: "M-100",
			price: 1500,
			availability: "sold_out",
			maxQuantity: 0,
		});
	});
});

describe("queryCatalog", () => {
	test("without refinements lists everything, in stock first, then by category order", () => {
		const r = query({});
		expect(r.total).toBe(5);
		expect(slugs(r)).toEqual([
			"low-profile-keyboard",
			"ergonomic-silent-mouse",
			"gaming-desk-mat",
			// Same category, by name: Halo before Prism.
			"halo-rgb-light-bar",
			"prism-rgb-desk-lamp",
		]);
		expect(r.priceRange).toEqual({ min: 1700, max: 2500 });
	});

	test("search ignores accents and case and needs every word", () => {
		expect(slugs(query({ q: "ILUMINACION" }))).toEqual([
			"halo-rgb-light-bar",
			"prism-rgb-desk-lamp",
		]);
		expect(slugs(query({ q: "razer rgb" }))).toEqual(["halo-rgb-light-bar"]);
		expect(slugs(query({ q: "akk-esm" }))).toEqual(["ergonomic-silent-mouse"]);
		expect(query({ q: "webcam" }).total).toBe(0);
		expect(query({ q: "   " }).total).toBe(5);
	});

	test("values of one facet are alternatives; facets narrow each other", () => {
		expect(
			slugs(query({ category: ["iluminacion", "ratones"], sort: "name" })),
		).toEqual([
			"ergonomic-silent-mouse",
			"halo-rgb-light-bar",
			"prism-rgb-desk-lamp",
		]);
		expect(
			slugs(query({ category: ["iluminacion"], brand: ["akko"] })),
		).toEqual(["prism-rgb-desk-lamp"]);
	});

	test("a facet's counts keep every other refinement but not its own", () => {
		const r = query({ category: ["iluminacion"], brand: ["razer"] });
		expect(slugs(r)).toEqual(["halo-rgb-light-bar"]);
		// Categories counted among Razer products; brands among lighting.
		expect(counts(r.facets.category)).toEqual({
			teclados: 1,
			ratones: 0,
			alfombrillas: 1,
			iluminacion: 1,
		});
		expect(counts(r.facets.brand)).toEqual({
			akko: 1,
			razer: 1,
		});
		expect(
			r.facets.category.find((c) => c.slug === "iluminacion")?.selected,
		).toBe(true);
	});

	test("a product with several matching values counts once per value", () => {
		const r = query({});
		expect(counts(r.facets.collection)).toEqual({ essentials: 3, new: 2 });
	});

	test("facets list the values found by the search and the selected ones", () => {
		const r = query({ q: "mouse", collection: ["empty"] });
		expect(r.total).toBe(0);
		expect(r.facets.category.map((c) => c.slug)).toEqual(["ratones"]);
		expect(r.facets.collection).toEqual([
			{ slug: "essentials", name: "Lo esencial", count: 1, selected: false },
			{ slug: "empty", name: "Sin productos", count: 0, selected: true },
		]);
	});

	test("price bounds are inclusive and the range ignores the price refinement", () => {
		const r = query({ minPrice: 1900, maxPrice: 2400 });
		expect(slugs(r).sort()).toEqual([
			"halo-rgb-light-bar",
			"low-profile-keyboard",
			"prism-rgb-desk-lamp",
		]);
		expect(r.priceRange).toEqual({ min: 1700, max: 2500 });
		expect(query({ category: ["iluminacion"] }).priceRange).toEqual({
			min: 1900,
			max: 2200,
		});
		expect(query({ q: "webcam" }).priceRange).toBeNull();
	});

	test("availability: in stock when any size has units, else sold out", () => {
		const r = query({ availability: "in_stock" });
		expect(slugs(r)).toEqual([
			"low-profile-keyboard",
			"ergonomic-silent-mouse",
		]);
		expect(r.facets.availability).toEqual([
			{ value: "in_stock", count: 2, selected: true },
			{ value: "sold_out", count: 3, selected: false },
		]);
		expect(
			query({ availability: "sold_out", category: ["iluminacion"] }).facets
				.availability,
		).toEqual([
			{ value: "in_stock", count: 0, selected: false },
			{ value: "sold_out", count: 2, selected: true },
		]);
	});

	test("sorts by price, name and newest with stable ties", () => {
		// What is in stock is ordered first, then the sold-out ones in the same order.
		expect(slugs(query({ sort: "price_asc" }))).toEqual([
			"ergonomic-silent-mouse",
			"low-profile-keyboard",
			"prism-rgb-desk-lamp",
			"halo-rgb-light-bar",
			"gaming-desk-mat",
		]);
		expect(slugs(query({ sort: "price_desc" }))).toEqual([
			"low-profile-keyboard",
			"ergonomic-silent-mouse",
			"gaming-desk-mat",
			"halo-rgb-light-bar",
			"prism-rgb-desk-lamp",
		]);
		expect(slugs(query({ sort: "name" }))).toEqual([
			"ergonomic-silent-mouse",
			"low-profile-keyboard",
			"gaming-desk-mat",
			"halo-rgb-light-bar",
			"prism-rgb-desk-lamp",
		]);
		// Same creation time: the later id first.
		expect(slugs(query({ sort: "newest" }))).toEqual([
			"ergonomic-silent-mouse",
			"low-profile-keyboard",
			"gaming-desk-mat",
			"halo-rgb-light-bar",
			"prism-rgb-desk-lamp",
		]);
	});

	test("best rated first: the average, then the number of reviews, unrated last", () => {
		const rated = [
			{ ...keyboard, rating: { average: 4.5, count: 3 } },
			{ ...mouse, rating: { average: 4.5, count: 9 } },
			{ ...lightBar, rating: { average: 4.9, count: 2 } },
			lamp,
			{ ...deskMat, rating: { average: 3, count: 1 } },
		];
		const r = queryCatalog(
			rated,
			dimensions,
			{ ...none, sort: "rating" },
			"es",
		);
		expect(slugs(r)).toEqual([
			"ergonomic-silent-mouse",
			"low-profile-keyboard",
			"halo-rgb-light-bar",
			"gaming-desk-mat",
			"prism-rgb-desk-lamp",
		]);
	});

	test("a list of slugs narrows the list to those products", () => {
		expect(
			slugs(query({ slug: ["gaming-desk-mat", "low-profile-keyboard"] })),
		).toEqual(["low-profile-keyboard", "gaming-desk-mat"]);
		expect(query({ slug: [] }).total).toBe(5);
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
			"low-profile-keyboard",
			"ergonomic-silent-mouse",
			"halo-rgb-light-bar",
		]);
		expect(slugs(query({ collection: ["new"] }))).toEqual([
			"halo-rgb-light-bar",
			"gaming-desk-mat",
		]);
		expect(
			sortEntries(
				entries.filter((e) => e.collections.some((c) => c.slug === "new")),
				"es",
				"featured",
				["new"],
			).map((e) => e.slug),
		).toEqual(["halo-rgb-light-bar", "gaming-desk-mat"]);
	});

	test("pages through the results", () => {
		const first = query({ sort: "price_asc", pageSize: 2 });
		expect(first).toMatchObject({ total: 5, page: 1, pageCount: 3 });
		expect(slugs(first)).toEqual([
			"ergonomic-silent-mouse",
			"low-profile-keyboard",
		]);
		expect(slugs(query({ sort: "price_asc", pageSize: 2, page: 3 }))).toEqual([
			"gaming-desk-mat",
		]);
		const beyond = query({ pageSize: 2, page: 9 });
		expect(beyond.items).toEqual([]);
		expect(beyond.total).toBe(5);
		expect(query({ q: "webcam" }).pageCount).toBe(1);
		expect(() => query({ page: 0 })).toThrow("Invalid page");
		expect(() => query({ pageSize: 0 })).toThrow("Invalid page size");
	});
});
