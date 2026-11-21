import { describe, expect, test } from "bun:test";
import { InvalidGtinError, normalizeGtin } from "./gtin";

describe("normalizeGtin", () => {
	test("pads EAN-13, UPC-A and GTIN-8 to GTIN-14", () => {
		expect(normalizeGtin("4006381333931")).toBe("04006381333931");
		expect(normalizeGtin("036000291452")).toBe("00036000291452");
		expect(normalizeGtin("96385074")).toBe("00000096385074");
		expect(normalizeGtin("10614141000415")).toBe("10614141000415");
	});

	test("ignores spaces and hyphens as printed", () => {
		expect(normalizeGtin("400 6381 33393-1")).toBe("04006381333931");
	});

	test("refuses a wrong check digit, length or characters", () => {
		for (const bad of [
			"4006381333932",
			"12345",
			"400638133393X",
			"",
			"0000000000000000",
		])
			expect(() => normalizeGtin(bad)).toThrow(InvalidGtinError);
	});
});
