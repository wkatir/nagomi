import { describe, expect, test } from "bun:test";
import { orderFilters, orderListSearch } from "./orders";

describe("orderListSearch", () => {
	test("an empty search is the newest first, 25 to a page", () => {
		expect(orderListSearch.parse({})).toEqual({
			page: 1,
			pageSize: 25,
			sort: "createdAt",
			dir: "desc",
		});
	});

	test("takes the text of a query string as well as typed values", () => {
		expect(
			orderListSearch.parse({
				page: "3",
				pageSize: "50",
				sort: "total",
				dir: "asc",
				status: "delivered",
				paymentStatus: "partially_paid",
				channel: "instagram",
				from: "2026-10-01",
				to: "2026-10-31",
				q: "  ana ",
			}),
		).toEqual({
			page: 3,
			pageSize: 50,
			sort: "total",
			dir: "asc",
			status: "delivered",
			paymentStatus: "partially_paid",
			channel: "instagram",
			from: "2026-10-01",
			to: "2026-10-31",
			q: "ana",
		});
	});

	test("refuses what the list cannot show", () => {
		for (const search of [
			{ sort: "password" },
			{ sort: "payment" },
			{ dir: "up" },
			{ page: 0 },
			{ page: 1.5 },
			{ pageSize: 7 },
			{ status: "lost" },
			{ paymentStatus: "maybe" },
			{ channel: "fax" },
			{ from: "2026-02-31" },
			{ q: "" },
			{ q: "x".repeat(81) },
		])
			expect(orderListSearch.safeParse(search).success).toBe(false);
	});

	test("a range that ends before it starts is refused on its end", () => {
		const result = orderListSearch.safeParse({
			from: "2026-10-05",
			to: "2026-10-01",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(["to"]);
		expect(
			orderListSearch.safeParse({ from: "2026-10-05", to: "2026-10-05" })
				.success,
		).toBe(true);
	});
});

describe("orderFilters", () => {
	test("has the filters of the list and none of its paging", () => {
		expect(
			orderFilters.parse({ status: "pending", page: "9", sort: "total" }),
		).toEqual({ status: "pending" });
		expect(
			orderFilters.safeParse({ from: "2026-10-05", to: "2026-10-01" }).success,
		).toBe(false);
	});
});
