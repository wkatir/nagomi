import { describe, expect, test } from "bun:test";
import { parseMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import {
	emptySize,
	type SizeValues,
	sizeIssues,
	sizePayload,
	sizeValues,
} from "./size-form";

const parseAmount = (text: string) => parseMoney(text, "USD");
const issues = (change: Partial<SizeValues>, priceRequired = false) =>
	sizeIssues(
		{ ...emptySize, sku: "OIL-30", ...change },
		{
			parseAmount,
			priceRequired,
		},
	).map((i) => [i.field, i.message]);

describe("sizeIssues", () => {
	test("a SKU alone is a size", () => {
		expect(issues({})).toEqual([]);
		expect(issues({ sku: "oil.30_b-2" })).toEqual([]);
	});

	test("the SKU is required and made of letters, digits and single separators", () => {
		expect(issues({ sku: "  " })).toEqual([["sku", m.admin_required()]]);
		for (const sku of [
			"OIL 30",
			"OIL--30",
			"-OIL",
			"OIL-",
			"ÁCIDO",
			"A".repeat(41),
		])
			expect(issues({ sku })).toEqual([["sku", m.admin_product_sku_invalid()]]);
		expect(issues({ sku: "A".repeat(40) })).toEqual([]);
	});

	test("the size and its unit go together, and the size is a whole number", () => {
		expect(issues({ sizeValue: "30" })).toEqual([
			["sizeUnit", m.admin_required()],
		]);
		expect(issues({ sizeUnit: "ml" })).toEqual([
			["sizeValue", m.admin_required()],
		]);
		expect(issues({ sizeValue: "30", sizeUnit: "ml" })).toEqual([]);
		for (const sizeValue of ["0", "1.5", "-3", "abc", "100001"])
			expect(issues({ sizeValue, sizeUnit: "g" })).toEqual([
				["sizeValue", m.admin_product_size_invalid()],
			]);
		expect(issues({ sizeValue: "100000", sizeUnit: "g" })).toEqual([]);
	});

	test("a price is a positive amount, and required once the product is published", () => {
		expect(issues({ price: "15.50" })).toEqual([]);
		for (const price of ["0", "abc", "1.234", "-2", "1000000.01"])
			expect(issues({ price })).toEqual([["price", m.admin_invalid_amount()]]);
		expect(issues({}, true)).toEqual([["price", m.admin_required()]]);
		expect(issues({ price: "15" }, true)).toEqual([]);
	});

	test("a compare-at price is above the price, which it needs", () => {
		expect(issues({ price: "15", compareAtPrice: "20" })).toEqual([]);
		for (const compareAtPrice of ["15", "10"])
			expect(issues({ price: "15", compareAtPrice })).toEqual([
				["compareAtPrice", m.admin_product_compare_over_price()],
			]);
		expect(issues({ compareAtPrice: "20" })).toEqual([
			["compareAtPrice", m.admin_product_compare_over_price()],
		]);
		expect(issues({ price: "15", compareAtPrice: "x" })).toEqual([
			["compareAtPrice", m.admin_invalid_amount()],
		]);
	});

	test("a barcode has the digits and the check digit of a GTIN", () => {
		expect(issues({ gtin: "4006381333931" })).toEqual([]);
		expect(issues({ gtin: "4006 3813-33931" })).toEqual([]);
		for (const gtin of ["4006381333932", "123", "abcdefgh"])
			expect(issues({ gtin })).toEqual([
				["gtin", m.admin_product_gtin_invalid()],
			]);
	});

	test("the reorder point is a whole number up to the API's limit", () => {
		expect(issues({ reorderPoint: "0" })).toEqual([]);
		expect(issues({ reorderPoint: "100000" })).toEqual([]);
		for (const reorderPoint of ["-1", "2.5", "100001", "x"])
			expect(issues({ reorderPoint })).toEqual([
				["reorderPoint", m.admin_product_reorder_invalid()],
			]);
	});

	test("reports every field at fault together", () => {
		expect(
			issues({ sku: "", sizeValue: "5", price: "x", gtin: "1" }).map(
				([field]) => field,
			),
		).toEqual(["sku", "sizeUnit", "price", "gtin"]);
	});
});

describe("sizePayload", () => {
	test("turns the text into what the API takes, blanks into null", () => {
		expect(
			sizePayload(
				{
					sku: " oil-30 ",
					sizeValue: "30",
					sizeUnit: "ml",
					price: "15.5",
					compareAtPrice: "20",
					gtin: " 4006381333931 ",
					reorderPoint: "4",
				},
				parseAmount,
			),
		).toEqual({
			sku: "oil-30",
			sizeValue: 30,
			sizeUnit: "ml",
			price: 1550,
			compareAtPrice: 2000,
			gtin: "4006381333931",
			reorderPoint: 4,
		});
		expect(sizePayload({ ...emptySize, sku: "OIL" }, parseAmount)).toEqual({
			sku: "OIL",
			sizeValue: null,
			sizeUnit: null,
			price: null,
			compareAtPrice: null,
			gtin: null,
			reorderPoint: null,
		});
	});
});

describe("sizeValues", () => {
	test("puts a stored size in the form's text, empty where it has nothing", () => {
		const toInput = (amount: number) => (amount / 100).toFixed(2);
		expect(
			sizeValues(
				{
					sku: "OIL-30",
					sizeValue: 30,
					sizeUnit: "ml",
					price: 1550,
					compareAtPrice: null,
					gtin: "04006381333931",
					reorderPoint: 0,
				},
				toInput,
			),
		).toEqual({
			sku: "OIL-30",
			sizeValue: "30",
			sizeUnit: "ml",
			price: "15.50",
			compareAtPrice: "",
			gtin: "04006381333931",
			reorderPoint: "0",
		});
		expect(
			sizeValues(
				{
					sku: "X",
					sizeValue: null,
					sizeUnit: null,
					price: null,
					compareAtPrice: null,
					gtin: null,
					reorderPoint: null,
				},
				toInput,
			),
		).toEqual({ ...emptySize, sku: "X" });
	});
});
