import { describe, expect, test } from "bun:test";
import {
	activeCount,
	clearFilters,
	hasUnknownValue,
	isKnownKind,
	listingFilter,
	listingSearch,
	listOf,
	pagesOf,
	setAvailability,
	setPrice,
	setQuery,
	setSort,
	showMore,
	toggle,
} from "./listing";

const parse = (search: Record<string, unknown>) => listingSearch.parse(search);

describe("listingSearch", () => {
	test("keeps a numeric-looking slug as text and drops values it does not know", () => {
		expect(parse({ brand: 123 }).brand).toBe("123");
		const bad = parse({ sort: "cheapest", availability: "sold_out", page: 0 });
		expect(bad.sort).toBeUndefined();
		expect(bad.availability).toBeUndefined();
		expect(bad.page).toBeUndefined();
	});

	test("trims the search and treats a blank one as none", () => {
		expect(parse({ q: "  teclado " }).q).toBe("teclado");
		expect(parse({ q: "   " }).q).toBeUndefined();
		expect(parse({ q: "x".repeat(81) }).q).toBeUndefined();
	});
});

describe("toggle", () => {
	test("adds a value, removes it again and drops the parameter when none is left", () => {
		const one = toggle({}, "brand", "akko");
		expect(one.brand).toBe("akko");
		const two = toggle(one, "brand", "pulsar");
		expect(listOf(two.brand)).toEqual(["akko", "pulsar"]);
		const back = toggle(toggle(two, "brand", "akko"), "brand", "pulsar");
		expect(back.brand).toBeUndefined();
	});

	test("starts again from the first page and leaves the other facets", () => {
		const next = toggle({ page: 3, brand: "akko" }, "category", "teclados");
		expect(next).toMatchObject({ brand: "akko", category: "teclados" });
		expect(next.page).toBeUndefined();
	});
});

describe("other changes", () => {
	test("availability on and off", () => {
		expect(setAvailability({}, true).availability).toBe("in_stock");
		expect(setAvailability({ availability: "in_stock" }, false)).toEqual({
			availability: undefined,
			page: undefined,
		});
	});

	test("a price range starts from the first page and never ends below its start", () => {
		expect(setPrice({ page: 3 }, 2000, 5000)).toEqual({
			page: undefined,
			minPrice: 2000,
			maxPrice: 5000,
		});
		expect(setPrice({}, 5000, 2000)).toMatchObject({
			minPrice: 5000,
			maxPrice: 5000,
		});
		expect(setPrice({ minPrice: 1 }, undefined, 900).minPrice).toBeUndefined();
	});

	test("the default order is not written to the URL", () => {
		expect(setSort({ sort: "rating" }, "featured").sort).toBeUndefined();
		expect(setSort({}, "newest").sort).toBe("newest");
	});

	test("a new search starts from the first page", () => {
		expect(setQuery({ page: 2, q: "a" }, "b")).toMatchObject({ q: "b" });
		expect(setQuery({ page: 2 }, "b").page).toBeUndefined();
	});

	test("show more adds a page", () => {
		expect(showMore({}).page).toBe(2);
		expect(showMore({ page: 4 }).page).toBe(5);
	});

	test("clearing keeps the search and the order", () => {
		const cleared = clearFilters({
			q: "rgb",
			sort: "rating",
			category: "teclados",
			brand: "akko",
			availability: "in_stock",
			minPrice: 1000,
			page: 2,
		});
		expect(cleared).toMatchObject({ q: "rgb", sort: "rating" });
		expect(cleared.minPrice).toBeUndefined();
		expect(activeCount(cleared)).toBe(0);
		expect(cleared.page).toBeUndefined();
	});
});

describe("activeCount", () => {
	test("counts every value of every facet and availability, not the search", () => {
		expect(
			activeCount({
				q: "rgb",
				category: "teclados,ratones",
				brand: "akko",
				availability: "in_stock",
				maxPrice: 5000,
			}),
		).toBe(5);
		expect(activeCount({})).toBe(0);
	});
});

describe("listingFilter", () => {
	test("puts the scope's value before the customer's and defaults the order", () => {
		expect(
			listingFilter(
				"es",
				{ brand: "akko", sort: undefined },
				{ brand: "pulsar" },
			),
		).toEqual({
			locale: "es",
			q: undefined,
			category: [],
			brand: ["pulsar", "akko"],
			availability: undefined,
			minPrice: undefined,
			maxPrice: undefined,
			sort: "featured",
		});
	});

	test("the same search gives the same filter", () => {
		const a = listingFilter("en", parse({ brand: "a,b", sort: "rating" }));
		const b = listingFilter("en", parse({ sort: "rating", brand: "a,b" }));
		expect(a).toEqual(b);
	});
});

describe("isKnownKind", () => {
	test("accepts slugs and refuses anything else", () => {
		expect(
			isKnownKind(parse({ category: "teclados,ratones", brand: "akko" })),
		).toBe(true);
		expect(isKnownKind(parse({ category: "Royal Kludge" }))).toBe(false);
		expect(isKnownKind(parse({ brand: "a".repeat(81) }))).toBe(false);
		expect(isKnownKind(parse({}))).toBe(true);
	});
});

describe("hasUnknownValue", () => {
	const facets = {
		category: [
			{ slug: "teclados", selected: true },
			{ slug: "ratones", selected: false },
		],
		brand: [{ slug: "akko", selected: true }],
	};
	test("is false when every value is among the selected facet values", () => {
		expect(
			hasUnknownValue(parse({ category: "teclados", brand: "akko" }), facets),
		).toBe(false);
		expect(hasUnknownValue(parse({}), facets)).toBe(false);
	});

	test("is true for a value the facets do not select", () => {
		expect(
			hasUnknownValue(parse({ category: "teclados,sillas" }), facets),
		).toBe(true);
		expect(hasUnknownValue(parse({ brand: "logitech" }), facets)).toBe(true);
	});
});

describe("pagesOf", () => {
	test("is every page up to the one asked", () => {
		expect(pagesOf({})).toEqual([1]);
		expect(pagesOf({ page: 3 })).toEqual([1, 2, 3]);
	});
});
