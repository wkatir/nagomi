import { describe, expect, test } from "bun:test";
import { customerFilters, customerListSearch } from "./customers";

describe("customerListSearch", () => {
	test("an empty search is the newest customers first, 25 to a page", () => {
		expect(customerListSearch.parse({})).toEqual({
			page: 1,
			pageSize: 25,
			sort: "createdAt",
			dir: "desc",
		});
	});

	test("takes the text of a query string as well as typed values", () => {
		expect(
			customerListSearch.parse({
				page: "3",
				pageSize: "50",
				sort: "spent",
				dir: "asc",
				q: "  ana ",
			}),
		).toEqual({ page: 3, pageSize: 50, sort: "spent", dir: "asc", q: "ana" });
	});

	test("accepts each sort the table offers", () => {
		for (const sort of [
			"name",
			"orders",
			"spent",
			"lastOrder",
			"createdAt",
		] as const)
			expect(customerListSearch.parse({ sort }).sort).toBe(sort);
	});

	test("refuses what the list cannot show", () => {
		for (const search of [
			{ sort: "password" },
			{ sort: "phone" },
			{ dir: "up" },
			{ page: 0 },
			{ page: 1.5 },
			{ pageSize: 7 },
			{ q: "" },
			{ q: "x".repeat(81) },
		])
			expect(customerListSearch.safeParse(search).success).toBe(false);
	});
});

describe("customerFilters", () => {
	test("has the search of the list and none of its paging", () => {
		expect(
			customerFilters.parse({ q: "ana", page: "9", sort: "name" }),
		).toEqual({ q: "ana" });
		expect(customerFilters.parse({})).toEqual({});
		expect(customerFilters.safeParse({ q: "" }).success).toBe(false);
	});
});
