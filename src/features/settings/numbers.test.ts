import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { numberText, optionalWholeNumber, wholeNumber } from "./numbers";

const range = m.admin_settings_number_range({ min: 1, max: 365 });
const message = (result: {
	success: boolean;
	error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message);

describe("wholeNumber", () => {
	const schema = wholeNumber(1, 365);

	test("reads a whole number in range, trimming the text", () => {
		expect(schema.parse("1")).toBe(1);
		expect(schema.parse(" 30 ")).toBe(30);
		expect(schema.parse("365")).toBe(365);
		expect(schema.parse("007")).toBe(7);
	});

	test("refuses what is out of range or not a whole number, with the range in the message", () => {
		for (const text of ["", "0", "366", "1.5", "-1", "1e2", "abc", "12 3"]) {
			const result = schema.safeParse(text);
			expect(result.success).toBe(false);
			expect(message(result)).toEqual([range]);
		}
	});
});

describe("optionalWholeNumber", () => {
	const schema = optionalWholeNumber(1, 365);

	test("an empty field is not set", () => {
		expect(schema.parse("")).toBeNull();
		expect(schema.parse("   ")).toBeNull();
	});

	test("reads a whole number in range", () => {
		expect(schema.parse("14")).toBe(14);
		expect(schema.parse("365")).toBe(365);
	});

	test("refuses the rest like a required one", () => {
		for (const text of ["0", "366", "1.5", "x"])
			expect(message(schema.safeParse(text))).toEqual([range]);
	});
});

describe("numberText", () => {
	test("shows a number and leaves empty one that is not set", () => {
		expect(numberText(30)).toBe("30");
		expect(numberText(0)).toBe("0");
		expect(numberText(null)).toBe("");
	});
});
