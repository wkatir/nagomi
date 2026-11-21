import { describe, expect, test } from "bun:test";
import type { ProductRow } from "../merchandising/product-search";
import { variantChoices } from "./variant-choices";

const row = (overrides: Partial<ProductRow>): ProductRow => ({
	productId: 1,
	slug: "ampoule",
	status: "published",
	brand: "Crème Lab",
	category: "serum",
	name: "Ampolla calmante",
	variantId: 10,
	sku: "AMP-30",
	sizeValue: 30,
	sizeUnit: "ml",
	price: 1500,
	compareAtPrice: null,
	gtin: null,
	variantStatus: "active",
	reorderPoint: null,
	onHand: 0,
	committed: 0,
	available: 0,
	expired: 0,
	latestUnitCost: null,
	...overrides,
});

describe("variantChoices", () => {
	test("a choice is a size: brand, name and size, with the SKU as its hint", () => {
		expect(variantChoices([row({})])).toEqual([
			{
				key: 10,
				label: "Crème Lab Ampolla calmante 30 ml",
				hint: "AMP-30",
				draft: false,
			},
		]);
	});

	test("two sizes of one product are two choices", () => {
		const choices = variantChoices([
			row({}),
			row({ variantId: 11, sku: "AMP-50", sizeValue: 50 }),
		]);
		expect(choices.map((c) => [c.key, c.label])).toEqual([
			[10, "Crème Lab Ampolla calmante 30 ml"],
			[11, "Crème Lab Ampolla calmante 50 ml"],
		]);
	});

	test("a size with no measure, or a product with no name, leaves that out of the label", () => {
		const choices = variantChoices([
			row({ sizeValue: null, sizeUnit: null }),
			row({ variantId: 12, name: null }),
		]);
		expect(choices.map((c) => c.label)).toEqual([
			"Crème Lab Ampolla calmante",
			"Crème Lab 30 ml",
		]);
	});

	test("leaves out archived sizes and sizes of archived products", () => {
		const choices = variantChoices([
			row({ variantId: 1, variantStatus: "archived" }),
			row({ variantId: 2, status: "archived" }),
			row({ variantId: 3 }),
		]);
		expect(choices.map((c) => c.key)).toEqual([3]);
	});

	test("marks the sizes of a product still in draft", () => {
		const choices = variantChoices([
			row({ variantId: 1, status: "draft" }),
			row({ variantId: 2, status: "published" }),
		]);
		expect(choices.map((c) => c.draft)).toEqual([true, false]);
	});
});
