import { describe, expect, test } from "bun:test";
import { formatCompactMoney, formatPeriod, overTimeKind } from "./chart-format";

describe("formatPeriod", () => {
	test("a day or a week is its first day", () => {
		expect(formatPeriod("2026-10-05", "day", "en-US")).toBe("Oct 5");
		expect(formatPeriod("2026-10-05", "week", "en-US")).toBe("Oct 5");
		expect(formatPeriod("2026-10-05", "day", "es-SV")).toBe("5 oct");
	});

	test("a month is its name and year", () => {
		expect(formatPeriod("2026-10-01", "month", "en-US")).toBe("Oct 2026");
	});

	test("the first and the last day of a year stay in their day", () => {
		expect(formatPeriod("2026-01-01", "day", "en-US")).toBe("Jan 1");
		expect(formatPeriod("2026-12-31", "day", "en-US")).toBe("Dec 31");
	});
});

describe("formatCompactMoney", () => {
	test("shortens thousands of the major unit", () => {
		expect(formatCompactMoney(123456, "USD", "en-US")).toBe("$1.2K");
		expect(formatCompactMoney(0, "USD", "en-US")).toBe("$0");
		expect(formatCompactMoney(5000, "USD", "en-US")).toBe("$50");
	});

	test("reads minor units by the currency's decimals", () => {
		expect(formatCompactMoney(250000, "JPY", "en-US")).toBe("¥250K");
	});

	test("keeps the sign of a loss", () => {
		expect(formatCompactMoney(-123456, "USD", "en-US")).toBe("-$1.2K");
	});
});

describe("overTimeKind", () => {
	test("a line needs enough points to show a change, else bars", () => {
		expect(overTimeKind(3)).toBe("bar");
		expect(overTimeKind(6)).toBe("bar");
		expect(overTimeKind(7)).toBe("line");
		expect(overTimeKind(30)).toBe("line");
	});
});
