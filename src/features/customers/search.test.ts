import { describe, expect, test } from "bun:test";
import type { CustomerListSearch } from "#/lib/schemas/customers";
import {
	clearedFilters,
	customerSearchDefaults,
	exportHref,
	isFiltered,
} from "./search";

const base: CustomerListSearch = { ...customerSearchDefaults };

describe("customerSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(customerSearchDefaults).toEqual({
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
				sort: "spent",
				dir: "asc",
			}),
		).toBe(false);
	});

	test("a search is", () => {
		expect(isFiltered({ ...base, q: "ana" })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes the search off and goes back to the first page", () => {
		const filtered: CustomerListSearch = {
			...base,
			page: 5,
			sort: "orders",
			dir: "asc",
			q: "ana",
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(isFiltered(cleared)).toBe(false);
		expect(cleared.page).toBe(1);
		expect(cleared).toMatchObject({ sort: "orders", dir: "asc" });
	});
});

describe("exportHref", () => {
	test("exports every customer when nothing is searched", () => {
		expect(exportHref(base)).toBe("/api/admin/exports/customers.csv");
	});

	test("carries the search, and neither the page nor the sort", () => {
		const href = exportHref({
			...base,
			page: 3,
			pageSize: 50,
			sort: "spent",
			dir: "asc",
			q: "Ana Pérez",
		});
		const [path, query] = href.split("?");
		expect(path).toBe("/api/admin/exports/customers.csv");
		expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
			q: "Ana Pérez",
		});
	});
});
