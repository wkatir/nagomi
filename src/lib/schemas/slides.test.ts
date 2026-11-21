import { describe, expect, test } from "bun:test";
import { slideListSearch } from "./slides";

describe("slideListSearch", () => {
	test("is every slide when the URL has no status", () => {
		expect(slideListSearch.parse({})).toEqual({});
	});

	test("takes a status of the lifecycle", () => {
		for (const status of ["draft", "published", "archived"] as const)
			expect(slideListSearch.parse({ status })).toEqual({ status });
	});

	test("refuses a status that does not exist", () => {
		expect(slideListSearch.safeParse({ status: "live" }).success).toBe(false);
		expect(slideListSearch.safeParse({ status: "" }).success).toBe(false);
	});
});
