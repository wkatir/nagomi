import { describe, expect, test } from "bun:test";
import type { PurchaseListSearch } from "#/lib/schemas/purchasing";
import { clearedFilters, isFiltered, purchaseSearchDefaults } from "./search";

const base: PurchaseListSearch = { ...purchaseSearchDefaults };

describe("purchaseSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(purchaseSearchDefaults).toEqual({
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
				sort: "reference",
				dir: "asc",
			}),
		).toBe(false);
	});

	test("each filter alone is", () => {
		for (const filter of [
			{ q: "po" },
			{ status: "draft" },
			{ supplierId: 3 },
			{ from: "2026-10-01" },
			{ to: "2026-10-31" },
		] as const)
			expect(isFiltered({ ...base, ...filter })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes every filter off and goes back to the first page", () => {
		const filtered: PurchaseListSearch = {
			...base,
			page: 5,
			sort: "total",
			dir: "asc",
			q: "po",
			status: "ordered",
			supplierId: 2,
			from: "2026-10-01",
			to: "2026-10-31",
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(cleared).toEqual({
			...base,
			page: 1,
			sort: "total",
			dir: "asc",
			q: undefined,
			status: undefined,
			supplierId: undefined,
			from: undefined,
			to: undefined,
		});
		expect(isFiltered(cleared)).toBe(false);
	});
});
