import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { DEFAULT_PAGE_SIZE, pageCountOf, pagedSearch, toQuery } from "./list";

const search = pagedSearch(["name", "createdAt"], {
	sort: "createdAt",
	dir: "desc",
});

describe("pagedSearch", () => {
	test("fills the defaults of an empty query", () => {
		expect(search.parse({})).toEqual({
			page: 1,
			pageSize: DEFAULT_PAGE_SIZE,
			sort: "createdAt",
			dir: "desc",
		});
	});

	test("reads text from a query string and numbers from the router alike", () => {
		const fromApi = search.parse({
			page: "3",
			pageSize: "50",
			sort: "name",
			dir: "asc",
		});
		const fromRouter = search.parse({
			page: 3,
			pageSize: 50,
			sort: "name",
			dir: "asc",
		});
		expect(fromApi).toEqual(fromRouter);
		expect(fromApi).toMatchObject({ page: 3, pageSize: 50 });
	});

	test("trims the search text and refuses an empty or oversized one", () => {
		expect(search.parse({ q: "  keyboard  " }).q).toBe("keyboard");
		expect(search.safeParse({ q: "   " }).success).toBe(false);
		expect(search.safeParse({ q: "x".repeat(81) }).success).toBe(false);
	});

	test("refuses a page size outside the list, a page below 1, a fraction and an unknown sort", () => {
		for (const bad of [
			{ pageSize: 7 },
			{ pageSize: 101 },
			{ pageSize: 0 },
			{ page: 0 },
			{ page: -2 },
			{ page: 1.5 },
			{ sort: "price" },
			{ dir: "up" },
		])
			expect(search.safeParse(bad).success).toBe(false);
	});

	test("accepts every page size the screens offer", () => {
		for (const pageSize of [10, 25, 50, 100] as const)
			expect(search.parse({ pageSize }).pageSize).toBe(pageSize);
	});

	test("a list adds its own filters", () => {
		const orders = search.extend({
			status: z.enum(["open", "closed"]).optional(),
		});
		expect(orders.parse({ status: "open" }).status).toBe("open");
		expect(orders.safeParse({ status: "lost" }).success).toBe(false);
		expect(orders.parse({ page: 2 })).toMatchObject({ page: 2, pageSize: 25 });
	});
});

describe("pageCountOf", () => {
	test("rounds up and is never below one page", () => {
		expect(pageCountOf(0, 25)).toBe(1);
		expect(pageCountOf(25, 25)).toBe(1);
		expect(pageCountOf(26, 25)).toBe(2);
		expect(pageCountOf(100, 10)).toBe(10);
		expect(pageCountOf(101, 10)).toBe(11);
	});
});

describe("toQuery", () => {
	test("turns every value that is set into text and leaves the rest out", () => {
		expect(
			toQuery({ page: 2, q: "ana", status: undefined, sort: "createdAt" }),
		).toEqual({ page: "2", q: "ana", sort: "createdAt" });
	});

	test("keeps a zero and an empty text, which are values", () => {
		expect(toQuery({ page: 0, q: "" })).toEqual({ page: "0", q: "" });
	});
});
