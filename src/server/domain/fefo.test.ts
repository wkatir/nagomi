import { describe, expect, test } from "bun:test";
import { localDate } from "#/lib/dates";
import { parseExpiry } from "./expiry";
import { allocateFefo, InsufficientStockError, isExpired } from "./fefo";

const today = "2026-10-05";

describe("allocateFefo", () => {
	const lots = [
		{ lotId: 2, expiresOn: "2027-06-01", available: 5 },
		{ lotId: 1, expiresOn: "2027-01-01", available: 3 },
		{ lotId: 3, expiresOn: "2028-01-01", available: 0 },
	];

	test("takes the earliest expiry first and spills into the next lot", () => {
		expect(allocateFefo(lots, 4, today)).toEqual([
			{ lotId: 1, quantity: 3 },
			{ lotId: 2, quantity: 1 },
		]);
	});

	test("uses a single lot when it is enough", () => {
		expect(allocateFefo(lots, 3, today)).toEqual([{ lotId: 1, quantity: 3 }]);
	});

	test("breaks expiry ties by lot id", () => {
		const tied = [
			{ lotId: 9, expiresOn: "2027-01-01", available: 1 },
			{ lotId: 4, expiresOn: "2027-01-01", available: 1 },
		];
		expect(allocateFefo(tied, 1, today)).toEqual([{ lotId: 4, quantity: 1 }]);
	});

	test("skips expired lots and still sells a lot on its expiry date", () => {
		const aging = [
			{ lotId: 5, expiresOn: "2026-10-04", available: 4 },
			{ lotId: 6, expiresOn: "2026-10-05", available: 1 },
			{ lotId: 7, expiresOn: "2027-03-01", available: 2 },
		];
		expect(allocateFefo(aging, 2, today)).toEqual([
			{ lotId: 6, quantity: 1 },
			{ lotId: 7, quantity: 1 },
		]);
	});

	test("does not count expired units as available", () => {
		const expired = [
			{ lotId: 5, expiresOn: "2026-10-04", available: 4 },
			{ lotId: 7, expiresOn: "2027-03-01", available: 2 },
		];
		expect(() => allocateFefo(expired, 3, today)).toThrow(
			"Insufficient stock: 2 available, 3 requested",
		);
	});

	test("refuses partial allocation", () => {
		expect(() => allocateFefo(lots, 9, today)).toThrow(InsufficientStockError);
	});

	test("rejects non-positive or fractional quantities", () => {
		expect(() => allocateFefo(lots, 0, today)).toThrow("Invalid quantity");
		expect(() => allocateFefo(lots, 1.5, today)).toThrow("Invalid quantity");
	});
});

describe("expiry", () => {
	test("a lot expires the day after its expiry date", () => {
		expect(isExpired("2026-10-04", today)).toBe(true);
		expect(isExpired("2026-10-05", today)).toBe(false);
	});
});

describe("expiry precision and store time zone", () => {
	const monthLot = {
		lotId: 8,
		expiresOn: parseExpiry("2026-10").expiresOn,
		available: 2,
	};
	const dayLot = { lotId: 3, expiresOn: "2026-10-31", available: 2 };

	test("a month-precision lot is sold through the last day of its month", () => {
		expect(allocateFefo([monthLot], 1, "2026-10-31")).toEqual([
			{ lotId: 8, quantity: 1 },
		]);
		expect(() => allocateFefo([monthLot], 1, "2026-11-01")).toThrow(
			InsufficientStockError,
		);
	});

	test("ties with a day-precision lot on the same date go by lot id", () => {
		expect(allocateFefo([monthLot, dayLot], 3, "2026-10-05")).toEqual([
			{ lotId: 3, quantity: 2 },
			{ lotId: 8, quantity: 1 },
		]);
	});

	test("today is the store's local date, not the UTC date", () => {
		// 21:00 on October 31 in El Salvador is already November 1 in UTC.
		const today = localDate(
			new Date("2026-11-01T03:00:00Z"),
			"America/El_Salvador",
		);
		expect(today).toBe("2026-10-31");
		expect(allocateFefo([monthLot], 2, today)).toEqual([
			{ lotId: 8, quantity: 2 },
		]);
	});
});
