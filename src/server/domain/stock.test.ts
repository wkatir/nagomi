import { describe, expect, test } from "bun:test";
import {
	lineMax,
	pendingHoldStart,
	sellableUnits,
	unitsAvailability,
} from "./stock";

describe("sellableUnits", () => {
	test("is on hand minus committed, never below zero", () => {
		expect(sellableUnits(5, 2)).toBe(3);
		expect(sellableUnits(2, 2)).toBe(0);
		expect(sellableUnits(1, 3)).toBe(0);
	});
});

describe("lineMax", () => {
	test("is the smaller of the sellable units and the store's limit", () => {
		expect(lineMax(3, 20)).toBe(3);
		expect(lineMax(20, 20)).toBe(20);
		expect(lineMax(21, 20)).toBe(20);
		expect(lineMax(0, 20)).toBe(0);
	});
});

describe("unitsAvailability", () => {
	test("one unit is in stock, none is sold out", () => {
		expect(unitsAvailability(1)).toBe("in_stock");
		expect(unitsAvailability(0)).toBe("sold_out");
	});
});

describe("pendingHoldStart", () => {
	test("is the start of yesterday in the store's time zone", () => {
		expect(pendingHoldStart("2026-10-18", "America/El_Salvador")).toBe(
			"2026-10-17T06:00:00Z",
		);
		expect(pendingHoldStart("2026-01-01", "America/El_Salvador")).toBe(
			"2025-12-31T06:00:00Z",
		);
	});

	test("follows daylight saving changes on the day it starts", () => {
		// New York changes at 02:00, so both midnights keep the offset of the day before.
		expect(pendingHoldStart("2026-11-02", "America/New_York")).toBe(
			"2026-11-01T04:00:00Z",
		);
		expect(pendingHoldStart("2026-11-03", "America/New_York")).toBe(
			"2026-11-02T05:00:00Z",
		);
		expect(pendingHoldStart("2026-03-09", "America/New_York")).toBe(
			"2026-03-08T05:00:00Z",
		);
	});
});
