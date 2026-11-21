import { describe, expect, test } from "bun:test";
import { DASHBOARD_DAYS, dashboardSearch } from "./dashboard";

describe("dashboardSearch", () => {
	test("sums up thirty days unless told otherwise", () => {
		expect(dashboardSearch.parse({})).toEqual({ days: 30 });
	});

	test("takes each window of the selector", () => {
		for (const days of DASHBOARD_DAYS)
			expect(dashboardSearch.parse({ days })).toEqual({ days });
	});

	test("refuses a window the selector does not offer", () => {
		for (const days of [0, 14, 365, "30"])
			expect(dashboardSearch.safeParse({ days }).success).toBe(false);
	});
});
