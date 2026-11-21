import { describe, expect, test } from "bun:test";
import { formatExpiry, InvalidExpiryError, parseExpiry } from "./expiry";

describe("parseExpiry", () => {
	test("keeps a full date with day precision", () => {
		expect(parseExpiry("2027-05-14")).toEqual({
			expiresOn: "2027-05-14",
			precision: "day",
		});
	});

	test("stores a month as its last day", () => {
		expect(parseExpiry("2027-05")).toEqual({
			expiresOn: "2027-05-31",
			precision: "month",
		});
		expect(parseExpiry("2028-02").expiresOn).toBe("2028-02-29");
		expect(parseExpiry("2027-12").expiresOn).toBe("2027-12-31");
	});

	test("rejects anything else", () => {
		for (const bad of ["2027-13", "2027-02-30", "2027/05", "05-2027", ""])
			expect(() => parseExpiry(bad)).toThrow(InvalidExpiryError);
	});
});

describe("formatExpiry", () => {
	test("shows what the label says", () => {
		expect(formatExpiry("2027-05-31", "month")).toBe("2027-05");
		expect(formatExpiry("2027-05-14", "day")).toBe("2027-05-14");
	});
});
