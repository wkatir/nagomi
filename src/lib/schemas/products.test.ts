import { describe, expect, test } from "bun:test";
import {
	PRODUCT_SORTS,
	PUBLISH_REQUIREMENTS,
	productListSearch,
} from "./products";

describe("productListSearch", () => {
	test("an empty search is the newest first, 25 to a page", () => {
		expect(productListSearch.parse({})).toEqual({
			page: 1,
			pageSize: 25,
			sort: "createdAt",
			dir: "desc",
		});
	});

	test("takes the text of a query string as well as typed values", () => {
		const expected = {
			page: 3,
			pageSize: 50,
			sort: "priceFrom",
			dir: "asc",
			status: "draft",
			brandId: 4,
			categoryId: 5,
			q: "teclado",
		} as const;
		expect(
			productListSearch.parse({
				page: "3",
				pageSize: "50",
				sort: "priceFrom",
				dir: "asc",
				status: "draft",
				brandId: "4",
				categoryId: "5",
				q: "  teclado ",
			}),
		).toEqual(expected);
		expect(
			productListSearch.parse({
				...expected,
				page: 3,
				pageSize: 50,
				brandId: 4,
			}),
		).toEqual(expected);
	});

	test("accepts each sort the table has", () => {
		for (const sort of PRODUCT_SORTS)
			expect(productListSearch.parse({ sort }).sort).toBe(sort);
		expect(PRODUCT_SORTS).toHaveLength(6);
	});

	test("refuses what the list cannot show", () => {
		for (const search of [
			{ sort: "sizes" },
			{ sort: "password" },
			{ dir: "up" },
			{ page: 0 },
			{ pageSize: 7 },
			{ status: "lost" },
			{ brandId: 0 },
			{ brandId: "x" },
			{ categoryId: 1.5 },
			{ q: "" },
			{ q: "x".repeat(81) },
		])
			expect(productListSearch.safeParse(search).success).toBe(false);
	});
});

describe("PUBLISH_REQUIREMENTS", () => {
	test("is the checklist in the order a person fixes it", () => {
		expect(PUBLISH_REQUIREMENTS).toEqual([
			"text",
			"price",
			"photo_alt",
			"brand",
			"category",
		]);
	});
});
