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
	setQuery,
	setSort,
	showMore,
	toggle,
} from "./listing";

const parse = (search: Record<string, unknown>) => listingSearch.parse(search);

describe("listingSearch", () => {
	test("keeps a numeric-looking slug as text and drops values it does not know", () => {
		expect(parse({ concern: 123 }).concern).toBe("123");
		const bad = parse({ sort: "cheapest", availability: "sold_out", page: 0 });
		expect(bad.sort).toBeUndefined();
		expect(bad.availability).toBeUndefined();
		expect(bad.page).toBeUndefined();
	});

	test("trims the search and treats a blank one as none", () => {
		expect(parse({ q: "  centella " }).q).toBe("centella");
		expect(parse({ q: "   " }).q).toBeUndefined();
		expect(parse({ q: "x".repeat(81) }).q).toBeUndefined();
	});
});

describe("toggle", () => {
	test("adds a value, removes it again and drops the parameter when none is left", () => {
		const one = toggle({}, "concern", "pores");
		expect(one.concern).toBe("pores");
		const two = toggle(one, "concern", "oily-acne");
		expect(listOf(two.concern)).toEqual(["pores", "oily-acne"]);
		const back = toggle(
			toggle(two, "concern", "pores"),
			"concern",
			"oily-acne",
		);
		expect(back.concern).toBeUndefined();
	});

	test("starts again from the first page and leaves the other facets", () => {
		const next = toggle({ page: 3, brand: "anua" }, "category", "serum");
		expect(next).toMatchObject({ brand: "anua", category: "serum" });
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

	test("the default order is not written to the URL", () => {
		expect(setSort({ sort: "name" }, "featured").sort).toBeUndefined();
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
			q: "sun",
			sort: "name",
			concern: "pores",
			skinType: "oily",
			availability: "in_stock",
			page: 2,
		});
		expect(cleared).toMatchObject({ q: "sun", sort: "name" });
		expect(activeCount(cleared)).toBe(0);
		expect(cleared.page).toBeUndefined();
	});
});

describe("activeCount", () => {
	test("counts every value of every facet and availability, not the search", () => {
		expect(
			activeCount({
				q: "sun",
				concern: "pores,oily-acne",
				brand: "anua",
				availability: "in_stock",
			}),
		).toBe(4);
		expect(activeCount({})).toBe(0);
	});
});

describe("listingFilter", () => {
	test("puts the scope's value before the customer's and defaults the order", () => {
		expect(
			listingFilter(
				"es",
				{ concern: "pores", sort: undefined },
				{ concern: "acne" },
			),
		).toEqual({
			locale: "es",
			q: undefined,
			concern: ["acne", "pores"],
			category: [],
			skinType: [],
			brand: [],
			availability: undefined,
			sort: "featured",
		});
	});

	test("the same search gives the same filter", () => {
		const a = listingFilter("en", parse({ concern: "a,b", sort: "name" }));
		const b = listingFilter("en", parse({ sort: "name", concern: "a,b" }));
		expect(a).toEqual(b);
	});
});

describe("isKnownKind", () => {
	test("accepts slugs and skin types, and refuses anything else", () => {
		expect(
			isKnownKind(parse({ concern: "oily-acne,pores", skinType: "dry" })),
		).toBe(true);
		expect(isKnownKind(parse({ concern: "Oily Acne" }))).toBe(false);
		expect(isKnownKind(parse({ brand: "a".repeat(81) }))).toBe(false);
		expect(isKnownKind(parse({ skinType: "scaly" }))).toBe(false);
		expect(isKnownKind(parse({}))).toBe(true);
	});
});

describe("hasUnknownValue", () => {
	const facets = {
		concern: [
			{ slug: "pores", selected: true },
			{ slug: "sensitive", selected: false },
		],
		category: [],
		skinType: [],
		brand: [{ slug: "anua", selected: true }],
	};
	test("is false when every value is among the selected facet values", () => {
		expect(
			hasUnknownValue(parse({ concern: "pores", brand: "anua" }), facets),
		).toBe(false);
		expect(hasUnknownValue(parse({}), facets)).toBe(false);
	});

	test("is true for a value the facets do not select", () => {
		expect(hasUnknownValue(parse({ concern: "pores,oily" }), facets)).toBe(
			true,
		);
		expect(hasUnknownValue(parse({ category: "mask" }), facets)).toBe(true);
	});
});

describe("pagesOf", () => {
	test("is every page up to the one asked", () => {
		expect(pagesOf({})).toEqual([1]);
		expect(pagesOf({ page: 3 })).toEqual([1, 2, 3]);
	});
});
