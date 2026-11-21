import { describe, expect, test } from "bun:test";
import type { ProductListSearch } from "#/lib/schemas/products";
import {
	clearedFilters,
	idOf,
	isFiltered,
	productSearchDefaults,
} from "./search";

const base: ProductListSearch = { ...productSearchDefaults };

describe("productSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(productSearchDefaults).toEqual({
			page: 1,
			pageSize: 25,
			sort: "createdAt",
			dir: "desc",
		});
	});
});

describe("isFiltered", () => {
	test("paging and sorting are not filters", () => {
		expect(isFiltered(base)).toBe(false);
		expect(
			isFiltered({
				...base,
				page: 4,
				pageSize: 100,
				sort: "stock",
				dir: "asc",
			}),
		).toBe(false);
	});

	test("each filter alone is", () => {
		for (const filter of [
			{ q: "aceite" },
			{ status: "draft" },
			{ brandId: 2 },
			{ categoryId: 3 },
			{ concernId: 4 },
		] as const)
			expect(isFiltered({ ...base, ...filter })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes every filter off and goes back to the first page", () => {
		const filtered: ProductListSearch = {
			...base,
			page: 5,
			sort: "priceFrom",
			dir: "asc",
			q: "aceite",
			status: "published",
			brandId: 2,
			categoryId: 3,
			concernId: 4,
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(isFiltered(cleared)).toBe(false);
		expect(cleared.page).toBe(1);
		// The sort the user chose stays.
		expect(cleared).toMatchObject({ sort: "priceFrom", dir: "asc" });
	});
});

describe("idOf", () => {
	test("reads the id a select holds, and nothing as no filter", () => {
		expect(idOf("12")).toBe(12);
		expect(idOf(undefined)).toBeUndefined();
	});
});
