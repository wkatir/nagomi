import { describe, expect, test } from "bun:test";
import {
	addDays,
	daysBetween,
	formatInstant,
	fromPickerDate,
	isCalendarDate,
	localDate,
	pickerDate,
	startOfLocalDay,
	toDbTimestamp,
	utcOffsetMinutes,
} from "./dates";

const SV = "America/El_Salvador";

// 2026 is not a leap year.
const DAYS_OF_2026 = Array.from({ length: 365 }, (_, i) =>
	addDays("2026-01-01", i),
);

describe("localDate", () => {
	test("is the calendar date in the zone, not in UTC", () => {
		const evening = new Date("2026-10-06T03:30:00Z");
		expect(localDate(evening, SV)).toBe("2026-10-05");
		expect(localDate(evening, "UTC")).toBe("2026-10-06");
		expect(localDate(new Date("2026-10-05T18:45:00Z"), "Asia/Kolkata")).toBe(
			"2026-10-06",
		);
	});
});

describe("calendar arithmetic", () => {
	test("adds days across months and leap years", () => {
		expect(addDays("2026-10-05", 30)).toBe("2026-11-04");
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
	});

	test("counts whole days between dates", () => {
		expect(daysBetween("2026-10-05", "2027-10-05")).toBe(365);
		expect(daysBetween("2026-10-05", "2026-10-04")).toBe(-1);
	});

	test("accepts only existing calendar dates", () => {
		expect(isCalendarDate("2028-02-29")).toBe(true);
		expect(isCalendarDate("2026-02-29")).toBe(false);
		expect(isCalendarDate("2026-02-31")).toBe(false);
		expect(isCalendarDate("2026-13-01")).toBe(false);
		expect(isCalendarDate("2026-1-01")).toBe(false);
	});

	test("rejects malformed dates", () => {
		expect(() => addDays("2026-10-5", 1)).toThrow("Invalid calendar date");
	});
});

describe("offsets and day boundaries", () => {
	test("reads the zone offset at an instant", () => {
		const now = new Date("2026-10-05T12:00:00Z");
		expect(utcOffsetMinutes(now, SV)).toBe(-360);
		expect(utcOffsetMinutes(now, "Asia/Kolkata")).toBe(330);
		expect(
			utcOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "America/New_York"),
		).toBe(-240);
		expect(
			utcOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "America/New_York"),
		).toBe(-300);
	});

	test("finds the UTC start of a local day", () => {
		expect(startOfLocalDay("2026-10-05", SV)).toBe("2026-10-05T06:00:00Z");
		expect(startOfLocalDay("2026-10-05", "UTC")).toBe("2026-10-05T00:00:00Z");
		expect(startOfLocalDay("2026-10-05", "Asia/Kolkata")).toBe(
			"2026-10-04T18:30:00Z",
		);
	});

	test("follows daylight saving changes", () => {
		// New York moves from UTC-4 to UTC-5 on 2026-11-01.
		expect(startOfLocalDay("2026-11-01", "America/New_York")).toBe(
			"2026-11-01T04:00:00Z",
		);
		expect(startOfLocalDay("2026-11-02", "America/New_York")).toBe(
			"2026-11-02T05:00:00Z",
		);
	});

	test("starts a day whose midnight is skipped at its first local instant", () => {
		// Santiago jumps from 00:00 to 01:00 on 2026-09-06 (UTC-4 to UTC-3).
		const start = startOfLocalDay("2026-09-06", "America/Santiago");
		expect(start).toBe("2026-09-06T04:00:00Z");
		expect(localDate(new Date(start), "America/Santiago")).toBe("2026-09-06");
		const before = new Date(new Date(start).getTime() - 1000);
		expect(localDate(before, "America/Santiago")).toBe("2026-09-05");
	});

	test("starts every day of 2026 at its local midnight in DST zones", () => {
		for (const zone of [
			"America/Santiago",
			"America/Asuncion",
			"America/Havana",
			"Atlantic/Azores",
			"America/New_York",
		])
			for (const day of DAYS_OF_2026) {
				const start = new Date(startOfLocalDay(day, zone)).getTime();
				expect(localDate(new Date(start), zone)).toBe(day);
				expect(localDate(new Date(start - 1000), zone)).toBe(addDays(day, -1));
			}
	});
});

describe("formatting", () => {
	test("writes timestamps in the database format", () => {
		expect(toDbTimestamp(new Date("2026-10-05T06:00:00.123Z"))).toBe(
			"2026-10-05T06:00:00Z",
		);
	});

	test("formats a stored instant in the store zone", () => {
		const instant = "2026-10-06T03:30:00Z";
		expect(formatInstant(instant, "es-SV", SV, { dateStyle: "long" })).toBe(
			"5 de octubre de 2026",
		);
		expect(formatInstant(instant, "en-SV", "UTC", { dateStyle: "long" })).toBe(
			"October 6, 2026",
		);
	});
});

describe("pickerDate and fromPickerDate", () => {
	test("go back and forth without shifting the day", () => {
		for (const day of ["2026-10-05", "2026-01-01", "2026-12-31", "2028-02-29"])
			expect(fromPickerDate(pickerDate(day))).toBe(day);
	});

	test("pickerDate is local midnight of that day", () => {
		const date = pickerDate("2026-03-08");
		expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
			2026, 2, 8,
		]);
		expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
	});

	test("pickerDate refuses what is not a calendar date", () => {
		expect(() => pickerDate("2026-3-8")).toThrow("Invalid calendar date");
	});
});
