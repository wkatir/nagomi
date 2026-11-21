import { describe, expect, test } from "bun:test";
import { expiryEnd, formatExpiryInput } from "./expiry-input";

describe("formatExpiryInput", () => {
	test("puts the hyphens of a month and of a day where they go as digits are typed", () => {
		expect(formatExpiryInput("")).toBe("");
		expect(formatExpiryInput("2")).toBe("2");
		expect(formatExpiryInput("2027")).toBe("2027");
		expect(formatExpiryInput("20275")).toBe("2027-5");
		expect(formatExpiryInput("202705")).toBe("2027-05");
		expect(formatExpiryInput("2027053")).toBe("2027-05-3");
		expect(formatExpiryInput("20270531")).toBe("2027-05-31");
	});

	test("keeps typing that is already formatted, drops what is not a digit and stops at a day", () => {
		expect(formatExpiryInput("2027-05")).toBe("2027-05");
		expect(formatExpiryInput("2027-05-31")).toBe("2027-05-31");
		expect(formatExpiryInput("2027.05")).toBe("2027-05");
		expect(formatExpiryInput("EXP 2027/05/31 extra 9")).toBe("2027-05-31");
	});

	test("deleting a digit takes the hyphen that no longer has one after it", () => {
		expect(formatExpiryInput("2027-0")).toBe("2027-0");
		expect(formatExpiryInput("2027-")).toBe("2027");
	});
});

describe("expiryEnd", () => {
	test("is the day itself for a day", () => {
		expect(expiryEnd("2027-05-31")).toBe("2027-05-31");
		expect(expiryEnd("2027-05-01")).toBe("2027-05-01");
	});

	test("is the last day of the month for a month, leap years included", () => {
		expect(expiryEnd("2027-05")).toBe("2027-05-31");
		expect(expiryEnd("2027-04")).toBe("2027-04-30");
		expect(expiryEnd("2027-02")).toBe("2027-02-28");
		expect(expiryEnd("2028-02")).toBe("2028-02-29");
		expect(expiryEnd("2027-12")).toBe("2027-12-31");
		expect(expiryEnd("9999-12")).toBe("9999-12-31");
	});

	test("is null for what is neither a day nor a month", () => {
		for (const text of [
			"",
			"2027",
			"2027-5",
			"2027-13",
			"2027-00",
			"2027-02-30",
			"2027-05-3",
			"27-05",
			"soon",
		])
			expect(expiryEnd(text)).toBeNull();
	});
});
