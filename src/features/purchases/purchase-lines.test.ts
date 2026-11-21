import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import {
	checkPurchaseLines,
	lineFieldOf,
	linesTotal,
	MAX_LINES,
	MAX_QUANTITY,
	type PurchaseLine,
	toRequestItems,
} from "./purchase-lines";

const parse = (text: string) => parseMoney(text, "USD");
const line = (change: Partial<PurchaseLine> = {}): PurchaseLine => ({
	id: null,
	variantId: 1,
	sku: "OIL-50",
	label: "Brand Aceite 50 ml",
	quantity: "10",
	unitCost: "7.00",
	...change,
});

function issues(lines: PurchaseLine[]) {
	const result = z
		.custom<{ lines: PurchaseLine[] }>()
		.superRefine((value, ctx) => checkPurchaseLines(value.lines, ctx, parse))
		.safeParse({ lines });
	return result.success
		? []
		: result.error.issues.map((i) => [i.path.join("."), i.message]);
}

describe("checkPurchaseLines", () => {
	test("finds nothing wrong with lines that have a quantity and a cost, free ones too", () => {
		expect(issues([line()])).toEqual([]);
		expect(issues([line({ unitCost: "0" }), line({ variantId: 2 })])).toEqual(
			[],
		);
		expect(issues([line({ quantity: String(MAX_QUANTITY) })])).toEqual([]);
	});

	test("asks for at least one line and allows no more than the API takes", () => {
		expect(issues([])).toEqual([["", m.admin_purchase_needs_lines()]]);
		const many = Array.from({ length: MAX_LINES + 1 }, (_, n) =>
			line({ variantId: n + 1 }),
		);
		expect(issues(many)).toEqual([
			["", m.admin_purchase_too_many_lines({ max: MAX_LINES })],
		]);
		expect(issues(many.slice(0, MAX_LINES))).toEqual([]);
	});

	test("refuses a quantity that is not a whole number from 1 to the most the API takes", () => {
		for (const quantity of [
			"",
			"0",
			"-2",
			"1.5",
			"ten",
			String(MAX_QUANTITY + 1),
		])
			expect(issues([line(), line({ quantity })])).toEqual([
				[
					"lines.1.quantity",
					m.admin_purchase_invalid_quantity({ max: MAX_QUANTITY }),
				],
			]);
	});

	test("refuses a unit cost that is not an amount, blank included", () => {
		for (const unitCost of ["", "free", "-1", "1.234"])
			expect(issues([line({ unitCost })])).toEqual([
				["lines.0.unitCost", m.admin_invalid_amount()],
			]);
		// More than the API takes: 1,000,000.01.
		expect(issues([line({ unitCost: "1000000.01" })])).toEqual([
			["lines.0.unitCost", m.admin_invalid_amount()],
		]);
	});

	test("puts each issue on its own line", () => {
		expect(
			issues([line({ quantity: "0" }), line(), line({ unitCost: "" })]).map(
				([path]) => path,
			),
		).toEqual(["lines.0.quantity", "lines.2.unitCost"]);
	});
});

describe("linesTotal", () => {
	test("adds quantity times unit cost of every line", () => {
		expect(linesTotal([], parse)).toBe(0);
		expect(
			linesTotal(
				[line(), line({ quantity: "5", unitCost: "12.00", variantId: 2 })],
				parse,
			),
		).toBe(7000 + 6000);
	});

	test("counts what is written while the rest is still being typed", () => {
		expect(
			linesTotal(
				[line({ quantity: "", unitCost: "5.00" }), line({ unitCost: "" })],
				parse,
			),
		).toBe(0);
		expect(linesTotal([line({ quantity: "3", unitCost: "1.50" })], parse)).toBe(
			450,
		);
	});
});

describe("toRequestItems", () => {
	test("sends the kept lines with their id and the new ones without", () => {
		expect(
			toRequestItems(
				[
					line({ id: 7, quantity: "12", unitCost: "6.50" }),
					line({ variantId: 2, quantity: "3", unitCost: "0" }),
				],
				parse,
			),
		).toEqual([
			{ id: 7, variantId: 1, quantity: 12, unitCost: 650 },
			{ variantId: 2, quantity: 3, unitCost: 0 },
		]);
	});

	test("fails on a cost that was not checked", () => {
		expect(() => toRequestItems([line({ unitCost: "" })], parse)).toThrow(
			"Unchecked cost of OIL-50",
		);
	});
});

describe("lineFieldOf", () => {
	test("names the form field of a line's path in the API's request", () => {
		expect(lineFieldOf("items.0.quantity")).toBe("lines[0].quantity");
		expect(lineFieldOf("items.12.unitCost")).toBe("lines[12].unitCost");
	});

	test("knows no other path", () => {
		for (const path of ["items", "items.0", "items.0.variantId", "reference"])
			expect(lineFieldOf(path)).toBeUndefined();
	});
});
