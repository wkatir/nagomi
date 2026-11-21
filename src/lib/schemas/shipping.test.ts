import { describe, expect, test } from "bun:test";
import { zoneListSearch } from "./shipping";

describe("zoneListSearch", () => {
	test("an empty search is the zones in the order the store set, 25 to a page", () => {
		expect(zoneListSearch.parse({})).toEqual({
			page: 1,
			pageSize: 25,
			sort: "position",
			dir: "asc",
		});
	});

	test("takes the text of a query string as well as typed values", () => {
		expect(
			zoneListSearch.parse({
				page: "2",
				pageSize: "10",
				sort: "deliveryDays",
				dir: "desc",
				status: "archived",
				method: "courier",
			}),
		).toEqual({
			page: 2,
			pageSize: 10,
			sort: "deliveryDays",
			dir: "desc",
			status: "archived",
			method: "courier",
		});
	});

	test("accepts each sort the table offers", () => {
		for (const sort of [
			"position",
			"name",
			"method",
			"fee",
			"deliveryDays",
		] as const)
			expect(zoneListSearch.parse({ sort }).sort).toBe(sort);
	});

	test("has no text search: a q is dropped", () => {
		expect(zoneListSearch.parse({ q: "centro" })).not.toHaveProperty("q");
	});

	test("refuses what the list cannot show", () => {
		for (const search of [
			{ sort: "slug" },
			{ sort: "freeFrom" },
			{ dir: "up" },
			{ page: 0 },
			{ pageSize: 7 },
			{ status: "inactive" },
			{ method: "drone" },
		])
			expect(zoneListSearch.safeParse(search).success).toBe(false);
	});
});
