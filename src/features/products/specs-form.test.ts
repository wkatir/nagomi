import { describe, expect, test } from "bun:test";
import {
	emptySpecRow,
	moveRow,
	specIssues,
	specRows,
	specsPayload,
} from "./specs-form";

const row = (es: [string, string], en: [string, string] = ["", ""]) => ({
	es: { label: es[0], value: es[1] },
	en: { label: en[0], value: en[1] },
});

describe("specIssues", () => {
	test("the store language needs a label and a value, another one only once typed in", () => {
		expect(specIssues([row(["Formato", "75%"])], "es")).toEqual([]);
		expect(specIssues([row(["Formato", ""])], "es")).toEqual([
			{ row: 0, locale: "es", reason: "required" },
		]);
		expect(specIssues([row(["Formato", "75%"], ["Layout", ""])], "es")).toEqual(
			[{ row: 0, locale: "en", reason: "required" }],
		);
		expect(specIssues([emptySpecRow()], "es")).toEqual([
			{ row: 0, locale: "es", reason: "required" },
		]);
	});

	test("refuses a label or value longer than the API takes", () => {
		expect(specIssues([row(["x".repeat(61), "75%"])], "es")).toEqual([
			{ row: 0, locale: "es", reason: "too_long" },
		]);
	});
});

describe("specsPayload", () => {
	test("trims the text and leaves out a blank language", () => {
		expect(specsPayload([row([" Formato ", " 75% "])])).toEqual([
			{ translations: { es: { label: "Formato", value: "75%" } } },
		]);
	});

	test("round-trips what the API stores", () => {
		const stored = [
			{
				translations: {
					es: { label: "Formato", value: "75%" },
					en: { label: "Layout", value: "75%" },
				},
			},
		];
		expect(specsPayload(specRows(stored))).toEqual(stored);
	});
});

describe("moveRow", () => {
	test("moves a row and ignores a move past either end", () => {
		expect(moveRow(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
		expect(moveRow(["a", "b"], 0, -1)).toEqual(["a", "b"]);
		expect(moveRow(["a", "b"], 1, 2)).toEqual(["a", "b"]);
	});
});
