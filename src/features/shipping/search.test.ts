import { describe, expect, test } from "bun:test";
import type { ZoneListSearch } from "#/lib/schemas/shipping";
import { clearedFilters, isFiltered, zoneSearchDefaults } from "./search";

const base: ZoneListSearch = { ...zoneSearchDefaults };

describe("zoneSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(zoneSearchDefaults).toEqual({
			page: 1,
			pageSize: 25,
			sort: "position",
			dir: "asc",
		});
	});
});

describe("isFiltered", () => {
	test("paging and sorting are not filters", () => {
		expect(isFiltered(base)).toBe(false);
		expect(
			isFiltered({ ...base, page: 2, pageSize: 10, sort: "fee", dir: "desc" }),
		).toBe(false);
	});

	test("each filter alone is", () => {
		for (const filter of [
			{ status: "archived" },
			{ method: "courier" },
		] as const)
			expect(isFiltered({ ...base, ...filter })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes every filter off and goes back to the first page", () => {
		const filtered: ZoneListSearch = {
			...base,
			page: 3,
			sort: "name",
			dir: "desc",
			status: "active",
			method: "pickup",
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(isFiltered(cleared)).toBe(false);
		expect(cleared.page).toBe(1);
		// The sort the user chose stays.
		expect(cleared).toMatchObject({ sort: "name", dir: "desc" });
	});
});
