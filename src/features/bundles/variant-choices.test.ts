import { describe, expect, test } from "bun:test";
import type { ProductRow } from "../merchandising/product-search";
import { variantChoices } from "./variant-choices";

const row = (overrides: Partial<ProductRow>): ProductRow => ({
	productId: 1,
	slug: "ampoule",
	status: "published",
	brand: "Akko",
	category: "teclados",
	name: "Teclado Sakura",
	variantId: 10,
	sku: "TEC-002",
	optionLabel: "Negro",
	price: 1500,
	compareAtPrice: null,
	gtin: null,
	variantStatus: "active",
	reorderPoint: null,
	onHand: 0,
	committed: 0,
	available: 0,
	latestUnitCost: null,
	...overrides,
});

describe("variantChoices", () => {
	test("a choice is a variant: brand, name and option, with the SKU as its hint", () => {
		expect(variantChoices([row({})])).toEqual([
			{
				key: 10,
				label: "Akko Teclado Sakura Negro",
				hint: "TEC-002",
				draft: false,
			},
		]);
	});

	test("two variants of one product are two choices", () => {
		const choices = variantChoices([
			row({}),
			row({ variantId: 11, sku: "TEC-012", optionLabel: "Blanco" }),
		]);
		expect(choices.map((c) => [c.key, c.label])).toEqual([
			[10, "Akko Teclado Sakura Negro"],
			[11, "Akko Teclado Sakura Blanco"],
		]);
	});

	test("a variant with no option, or a product with no name, leaves that out of the label", () => {
		const choices = variantChoices([
			row({ optionLabel: null }),
			row({ variantId: 12, name: null }),
		]);
		expect(choices.map((c) => c.label)).toEqual([
			"Akko Teclado Sakura",
			"Akko Negro",
		]);
	});

	test("leaves out archived variants and variants of archived products", () => {
		const choices = variantChoices([
			row({ variantId: 1, variantStatus: "archived" }),
			row({ variantId: 2, status: "archived" }),
			row({ variantId: 3 }),
		]);
		expect(choices.map((c) => c.key)).toEqual([3]);
	});

	test("marks the variants of a product still in draft", () => {
		const choices = variantChoices([
			row({ variantId: 1, status: "draft" }),
			row({ variantId: 2, status: "published" }),
		]);
		expect(choices.map((c) => c.draft)).toEqual([true, false]);
	});
});
