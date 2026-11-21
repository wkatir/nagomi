import { describe, expect, test } from "bun:test";
import {
	displayPhone,
	InvalidPhoneError,
	isWhatsappNumber,
	normalizePhone,
} from "./phone";

describe("normalizePhone", () => {
	test("writes every spelling of a number the same way", () => {
		for (const input of [
			"7123-4567",
			"7123 4567",
			"+503 7123 4567",
			"50371234567",
			"(503) 7123-4567",
		])
			expect(normalizePhone(input, "SV")).toBe("+50371234567");
	});

	test("keeps numbers from other countries", () => {
		expect(normalizePhone("+1 415 555 2671", "SV")).toBe("+14155552671");
	});

	test("reads a national number in the store's country", () => {
		expect(normalizePhone("2222 3333", "SV")).toBe("+50322223333");
		expect(normalizePhone("(415) 555-2671", "US")).toBe("+14155552671");
	});

	test("rejects numbers that cannot exist", () => {
		for (const input of ["1234", "abc", "", "+503 1234 5678"])
			expect(() => normalizePhone(input, "SV")).toThrow(InvalidPhoneError);
	});

	test("fails loudly on an unknown store country", () => {
		expect(() => normalizePhone("71234567", "ZZ")).toThrow(
			"Unsupported phone country",
		);
	});
});

describe("isWhatsappNumber", () => {
	test("accepts digits that form a valid international number", () => {
		expect(isWhatsappNumber("50362862515")).toBe(true);
		expect(isWhatsappNumber("14155552671")).toBe(true);
	});

	test("rejects digits with the right length that cannot be a number", () => {
		for (const digits of ["00000000", "12345678", "50312345678"])
			expect(isWhatsappNumber(digits)).toBe(false);
	});
});

describe("displayPhone", () => {
	test("groups an E.164 number as people read it", () => {
		expect(displayPhone("+50362862515")).toBe("+503 6286 2515");
		expect(displayPhone("+14155552671")).toBe("+1 415 555 2671");
	});
});
