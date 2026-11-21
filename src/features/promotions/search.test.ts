import { describe, expect, test } from "bun:test";
import type { PromotionListSearch } from "#/lib/schemas/promotions";
import { clearedFilters, isFiltered, promotionSearchDefaults } from "./search";

const base: PromotionListSearch = { ...promotionSearchDefaults };

describe("promotionSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(promotionSearchDefaults).toEqual({
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
			isFiltered({ ...base, page: 4, pageSize: 100, sort: "code", dir: "asc" }),
		).toBe(false);
	});

	test("each filter alone is", () => {
		for (const filter of [{ q: "spring" }, { status: "archived" }] as const)
			expect(isFiltered({ ...base, ...filter })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes every filter off and goes back to the first page", () => {
		const filtered: PromotionListSearch = {
			...base,
			page: 5,
			sort: "usage",
			dir: "asc",
			q: "spring",
			status: "active",
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(isFiltered(cleared)).toBe(false);
		expect(cleared.page).toBe(1);
		expect(cleared).toMatchObject({ sort: "usage", dir: "asc" });
	});
});
