import { describe, expect, test } from "bun:test";
import { bundleRefusal } from "./bundles";

const keyboard = { variantId: 1, quantity: 1, price: 7499 };
const mat = { variantId: 2, quantity: 1, price: 2499 };

describe("bundleRefusal", () => {
	test("a bundle still without items may have any price", () => {
		expect(bundleRefusal([], 100)).toBeNull();
	});

	test("a bundle with items has at least two", () => {
		expect(bundleRefusal([keyboard], 100)).toEqual({
			error: "bundle_requires_two_items",
		});
	});

	test("every item has a current price", () => {
		expect(bundleRefusal([keyboard, { ...mat, price: null }], 100)).toEqual({
			error: "bundle_item_unavailable",
			variantIds: [2],
		});
	});

	test("the price is below the sum of quantity times price", () => {
		expect(bundleRefusal([keyboard, { ...mat, quantity: 2 }], 12497)).toEqual({
			error: "bundle_price_not_below_items",
			price: 12497,
			itemsTotal: 12497,
		});
		expect(
			bundleRefusal([keyboard, { ...mat, quantity: 2 }], 12496),
		).toBeNull();
	});
});
