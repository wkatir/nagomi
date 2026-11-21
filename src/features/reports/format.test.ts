import { describe, expect, test } from "bun:test";
import { formatPercent } from "./format";

describe("formatPercent", () => {
	test("keeps one decimal at most", () => {
		expect(formatPercent(0.1234, "en-US")).toBe("12.3%");
		expect(formatPercent(0.5, "en-US")).toBe("50%");
		expect(formatPercent(0, "en-US")).toBe("0%");
	});

	test("a loss is negative", () => {
		expect(formatPercent(-0.05, "en-US")).toBe("-5%");
	});

	test("follows the language of the page", () => {
		expect(formatPercent(0.1234, "de-DE")).toMatch(/^12,3\s?%$/u);
	});
});
