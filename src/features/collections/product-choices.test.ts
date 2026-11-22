import { describe, expect, test } from "bun:test";
import type { ProductRow } from "../merchandising/product-search";
import { productChoices } from "./product-choices";

const row = (overrides: Partial<ProductRow>): ProductRow => ({
	productId: 1,
	slug: "teclado-sakura",
	status: "published",
	brand: "Crème Lab",
	category: "teclados",
	name: "Teclado Sakura",
	variantId: 10,
	sku: "TEC-002",
	optionLabel: null,
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

describe("productChoices", () => {
	test("a choice is a product: brand and name, with the slug as its hint", () => {
		expect(productChoices([row({})])).toEqual([
			{
				key: 1,
				label: "Crème Lab Teclado Sakura",
				hint: "teclado-sakura",
				draft: false,
			},
		]);
	});

	test("a product with several sizes is one choice", () => {
		const choices = productChoices([
			row({}),
			row({ variantId: 11, sku: "TEC-012" }),
			row({ productId: 2, variantId: 12, slug: "toner", name: "Tónico" }),
		]);
		expect(choices.map((c) => c.key)).toEqual([1, 2]);
	});

	test("leaves out archived products, whatever their sizes", () => {
		const choices = productChoices([
			row({ productId: 1, status: "archived" }),
			row({ productId: 1, status: "archived", variantId: 11 }),
			row({ productId: 2 }),
		]);
		expect(choices.map((c) => c.key)).toEqual([2]);
	});

	test("marks the products still in draft, and takes a product with no name by its brand", () => {
		const choices = productChoices([
			row({ productId: 1, status: "draft", name: null }),
		]);
		expect(choices).toEqual([
			{ key: 1, label: "Crème Lab", hint: "teclado-sakura", draft: true },
		]);
	});
});
