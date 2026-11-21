import { describe, expect, test } from "bun:test";
import { PROMOTION_CODE, promotionListSearch } from "./promotions";

describe("promotionListSearch", () => {
	test("an empty search is the newest promotions first, 25 to a page", () => {
		expect(promotionListSearch.parse({})).toEqual({
			page: 1,
			pageSize: 25,
			sort: "createdAt",
			dir: "desc",
		});
	});

	test("takes the text of a query string as well as typed values", () => {
		expect(
			promotionListSearch.parse({
				page: "2",
				pageSize: "10",
				sort: "usage",
				dir: "asc",
				status: "archived",
				q: " spring ",
			}),
		).toEqual({
			page: 2,
			pageSize: 10,
			sort: "usage",
			dir: "asc",
			status: "archived",
			q: "spring",
		});
	});

	test("accepts each sort the table offers and each status", () => {
		for (const sort of [
			"createdAt",
			"code",
			"usage",
			"startsOn",
			"endsOn",
		] as const)
			expect(promotionListSearch.parse({ sort }).sort).toBe(sort);
		for (const status of ["active", "inactive", "archived"] as const)
			expect(promotionListSearch.parse({ status }).status).toBe(status);
	});

	test("refuses what the list cannot show", () => {
		for (const search of [
			{ sort: "value" },
			{ dir: "up" },
			{ page: 0 },
			{ pageSize: 7 },
			{ status: "draft" },
			{ q: "" },
			{ q: "x".repeat(81) },
		])
			expect(promotionListSearch.safeParse(search).success).toBe(false);
	});
});

describe("PROMOTION_CODE", () => {
	test("is 3 to 32 capitals, digits, hyphens or underscores", () => {
		for (const code of ["ABC", "SPRING10", "A_B-9", "9".repeat(32)])
			expect(PROMOTION_CODE.test(code)).toBe(true);
		for (const code of [
			"AB",
			"spring10",
			"CON ESPACIO",
			"ÁNGEL",
			"A".repeat(33),
			"A.B",
			"",
		])
			expect(PROMOTION_CODE.test(code)).toBe(false);
	});
});
