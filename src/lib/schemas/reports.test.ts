import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	GRANULARITIES,
	LOOKBACK_WEEKS,
	MAX_RANGE_DAYS,
	reorderFields,
	reorderSearch,
	reportDays,
	salesSearch,
	TARGET_WEEKS,
	validRange,
} from "./reports";

describe("validRange", () => {
	test("a day, and a range of up to three years", () => {
		expect(validRange({ from: "2026-10-01", to: "2026-10-01" })).toBe(true);
		expect(validRange({ from: "2023-10-02", to: "2026-10-01" })).toBe(true);
	});

	test("a range one day beyond the maximum is refused", () => {
		expect(MAX_RANGE_DAYS).toBe(1096);
		// 1095 days apart is the longest range.
		expect(validRange({ from: "2023-10-01", to: "2026-10-01" })).toBe(false);
		expect(validRange({ from: "2023-10-02", to: "2026-10-01" })).toBe(true);
	});

	test("a reversed range is refused", () => {
		expect(validRange({ from: "2026-10-02", to: "2026-10-01" })).toBe(false);
	});
});

describe("reportDays", () => {
	test("no days at all is allowed: the screen picks the last ones", () => {
		expect(reportDays.parse({})).toEqual({});
	});

	test("takes both ends", () => {
		const days = { from: "2026-10-01", to: "2026-10-31" };
		expect(reportDays.parse(days)).toEqual(days);
	});

	test("refuses one end alone, on the end that is missing", () => {
		for (const days of [{ from: "2026-10-01" }, { to: "2026-10-01" }]) {
			const result = reportDays.safeParse(days);
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(["to"]);
		}
	});

	test("refuses days that do not exist, a reversed range and a range that is too long", () => {
		for (const days of [
			{ from: "2026-02-31", to: "2026-03-01" },
			{ from: "2026-10-02", to: "2026-10-01" },
			{ from: "2020-01-01", to: "2026-10-01" },
		])
			expect(reportDays.safeParse(days).success).toBe(false);
	});
});

describe("reorderFields", () => {
	test("looks back eight weeks unless told otherwise, and needs a target", () => {
		expect(reorderFields.lookbackWeeks.parse(undefined)).toBe(8);
		expect(reorderFields.targetWeeks.safeParse(undefined).success).toBe(false);
	});

	test("weeks are 1 to 52", () => {
		for (const weeks of [1, 52])
			expect(reorderFields.targetWeeks.parse(weeks)).toBe(weeks);
		for (const weeks of [0, 53, 1.5])
			expect(reorderFields.targetWeeks.safeParse(weeks).success).toBe(false);
	});
});

describe("salesSearch", () => {
	test("groups by day unless told otherwise", () => {
		expect(salesSearch.parse({})).toEqual({ granularity: "day" });
	});

	test("takes each grouping the API has, and no other", () => {
		for (const granularity of GRANULARITIES)
			expect(salesSearch.parse({ granularity })).toEqual({ granularity });
		expect(salesSearch.safeParse({ granularity: "year" }).success).toBe(false);
	});
});

describe("reorderSearch", () => {
	test("looks back eight weeks to cover four unless told otherwise", () => {
		expect(reorderSearch.parse({})).toEqual({
			lookbackWeeks: 8,
			targetWeeks: 4,
		});
	});

	test("takes the weeks of the selectors, and no others", () => {
		for (const lookbackWeeks of LOOKBACK_WEEKS)
			expect(reorderSearch.parse({ lookbackWeeks }).lookbackWeeks).toBe(
				lookbackWeeks,
			);
		for (const targetWeeks of TARGET_WEEKS)
			expect(reorderSearch.parse({ targetWeeks }).targetWeeks).toBe(
				targetWeeks,
			);
		expect(reorderSearch.safeParse({ lookbackWeeks: 5 }).success).toBe(false);
		expect(reorderSearch.safeParse({ targetWeeks: 3 }).success).toBe(false);
	});

	test("every choice is a query the API takes", () => {
		for (const lookbackWeeks of LOOKBACK_WEEKS)
			for (const targetWeeks of TARGET_WEEKS)
				expect(
					z.object(reorderFields).safeParse({ lookbackWeeks, targetWeeks })
						.success,
				).toBe(true);
	});
});
