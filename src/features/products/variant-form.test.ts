import { describe, expect, test } from "bun:test";
import { parseMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import {
	emptyVariant,
	type VariantValues,
	variantIssues,
	variantPayload,
	variantValues,
} from "./variant-form";

const parseAmount = (text: string) => parseMoney(text, "USD");
const issues = (change: Partial<VariantValues>, priceRequired = false) =>
	variantIssues(
		{ ...emptyVariant, sku: "TEC-001", ...change },
		{
			parseAmount,
			priceRequired,
		},
	).map((i) => [i.field, i.message]);

describe("variantIssues", () => {
	test("a SKU alone is a variant", () => {
		expect(issues({})).toEqual([]);
		expect(issues({ sku: "tec-001" })).toEqual([]);
	});

	test("the SKU is required and is three letters, a dash and three digits", () => {
		expect(issues({ sku: "  " })).toEqual([["sku", m.admin_required()]]);
		for (const sku of ["TEC 001", "TEC-01", "TECL-001", "TEC_001", "ÁBC-001"])
			expect(issues({ sku })).toEqual([["sku", m.admin_product_sku_invalid()]]);
	});

	test("the option label has a maximum length", () => {
		expect(issues({ optionLabel: "Switches rojos" })).toEqual([]);
		expect(issues({ optionLabel: "x".repeat(61) })).toEqual([
			["optionLabel", m.admin_product_option_too_long()],
		]);
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
			issues({ sku: "", price: "x", gtin: "1" }).map(([field]) => field),
		).toEqual(["sku", "price", "gtin"]);
	});
});

describe("variantPayload", () => {
	test("turns the text into what the API takes, blanks into null", () => {
		expect(
			variantPayload(
				{
					sku: " tec-001 ",
					optionLabel: " Switches rojos ",
					price: "15.5",
					compareAtPrice: "20",
					gtin: " 4006381333931 ",
					reorderPoint: "4",
				},
				parseAmount,
			),
		).toEqual({
			sku: "TEC-001",
			optionLabel: "Switches rojos",
			price: 1550,
			compareAtPrice: 2000,
			gtin: "4006381333931",
			reorderPoint: 4,
		});
		expect(
			variantPayload({ ...emptyVariant, sku: "TEC-002" }, parseAmount),
		).toEqual({
			sku: "TEC-002",
			optionLabel: null,
			price: null,
			compareAtPrice: null,
			gtin: null,
			reorderPoint: null,
		});
	});
});

describe("variantValues", () => {
	test("puts a stored variant in the form's text, empty where it has nothing", () => {
		const toInput = (amount: number) => (amount / 100).toFixed(2);
		expect(
			variantValues(
				{
					sku: "TEC-001",
					optionLabel: "Negro",
					price: 1550,
					compareAtPrice: null,
					gtin: "04006381333931",
					reorderPoint: 0,
				},
				toInput,
			),
		).toEqual({
			sku: "TEC-001",
			optionLabel: "Negro",
			price: "15.50",
			compareAtPrice: "",
			gtin: "04006381333931",
			reorderPoint: "0",
		});
		expect(
			variantValues(
				{
					sku: "X",
					optionLabel: null,
					price: null,
					compareAtPrice: null,
					gtin: null,
					reorderPoint: null,
				},
				toInput,
			),
		).toEqual({ ...emptyVariant, sku: "X" });
	});
});
