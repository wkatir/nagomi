import { describe, expect, test } from "bun:test";
import type { SupplierListSearch } from "#/lib/schemas/suppliers";
import { clearedFilters, isFiltered, supplierSearchDefaults } from "./search";

const base: SupplierListSearch = { ...supplierSearchDefaults };

describe("supplierSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(supplierSearchDefaults).toEqual({
			page: 1,
			pageSize: 25,
			sort: "name",
			dir: "asc",
		});
	});
});

describe("isFiltered", () => {
	test("paging and sorting are not filters", () => {
		expect(isFiltered(base)).toBe(false);
		expect(
			isFiltered({
				...base,
				page: 3,
				pageSize: 50,
				sort: "openPurchaseOrders",
				dir: "desc",
			}),
		).toBe(false);
	});

	test("each filter alone is", () => {
		expect(isFiltered({ ...base, q: "alpha" })).toBe(true);
		expect(isFiltered({ ...base, status: "archived" })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes every filter off and goes back to the first page", () => {
		const filtered: SupplierListSearch = {
			...base,
			page: 4,
			sort: "createdAt",
			q: "alpha",
			status: "archived",
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(cleared).toEqual({
			...base,
			page: 1,
			sort: "createdAt",
			q: undefined,
			status: undefined,
		});
		expect(isFiltered(cleared)).toBe(false);
	});
});
