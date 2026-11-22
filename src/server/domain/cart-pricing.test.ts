import { describe, expect, test } from "bun:test";
import {
	allocateBundle,
	allocateLines,
	BundleAllocationError,
	cartTotals,
	includedTax,
	OutOfStockError,
	paymentOptions,
} from "./cart-pricing";

describe("includedTax", () => {
	test("is the IVA inside a price that includes it, rounded half up", () => {
		// 113.00 with 13 % IVA: 100.00 + 13.00.
		expect(includedTax(11300, 1300)).toBe(1300);
		// 89.99 / 1.13 = 79.637... -> IVA 10.353 -> 10.35.
		expect(includedTax(8999, 1300)).toBe(1035);
		expect(includedTax(0, 1300)).toBe(0);
		expect(includedTax(5000, 0)).toBe(0);
	});

	test("refuses amounts that are not whole minor units", () => {
		expect(() => includedTax(10.5, 1300)).toThrow();
		expect(() => includedTax(-1, 1300)).toThrow();
	});
});

describe("allocateBundle", () => {
	test("splits the set price by list price so the units add up exactly", () => {
		const items = [
			{ quantity: 1, listPrice: 7499 },
			{ quantity: 1, listPrice: 2499 },
			{ quantity: 1, listPrice: 2499 },
		];
		const shares = allocateBundle(11499, items);
		expect(shares.reduce((n, s, i) => n + s * items[i].quantity, 0)).toBe(
			11499,
		);
		expect(shares[0]).toBeGreaterThan(shares[1]);
	});

	test("puts the rounding remainder on an item sold one at a time", () => {
		const items = [
			{ quantity: 2, listPrice: 1000 },
			{ quantity: 1, listPrice: 1000 },
		];
		const shares = allocateBundle(2501, items);
		expect(shares[0] * 2 + shares[1]).toBe(2501);
	});

	test("refuses a set whose price cannot be split into whole unit prices", () => {
		expect(() =>
			allocateBundle(1001, [
				{ quantity: 2, listPrice: 500 },
				{ quantity: 2, listPrice: 500 },
			]),
		).toThrow(BundleAllocationError);
	});
});

describe("cartTotals", () => {
	test("adds shipping to the discounted subtotal and reports the IVA included", () => {
		expect(
			cartTotals({
				subtotal: 10000,
				discount: 1500,
				shipping: 350,
				taxRateBp: 1300,
			}),
		).toEqual({
			subtotal: 10000,
			discount: 1500,
			shipping: 350,
			total: 8850,
			taxIncluded: includedTax(8850, 1300),
		});
	});

	test("without a municipality the total leaves shipping out", () => {
		expect(
			cartTotals({
				subtotal: 2000,
				discount: 0,
				shipping: null,
				taxRateBp: 1300,
			}).total,
		).toBe(2000);
	});

	test("a discount is never above the subtotal", () => {
		expect(() =>
			cartTotals({
				subtotal: 100,
				discount: 101,
				shipping: 0,
				taxRateBp: 1300,
			}),
		).toThrow();
	});
});

describe("paymentOptions", () => {
	const accepted = [
		{
			method: "card",
			maxTotal: null,
			shippingZoneId: null,
			shippingZoneSlug: null,
		},
		{
			method: "bank_transfer",
			maxTotal: null,
			shippingZoneId: null,
			shippingZoneSlug: null,
		},
		{
			method: "cash_on_delivery",
			maxTotal: 15000,
			shippingZoneId: 1,
			shippingZoneSlug: "metro",
		},
		{
			method: "cash",
			maxTotal: null,
			shippingZoneId: null,
			shippingZoneSlug: null,
		},
	];
	const reasons = (order: Parameters<typeof paymentOptions>[1]) =>
		Object.fromEntries(
			paymentOptions(accepted, order).map((o) => [o.method, o.reason]),
		);
	const base = {
		total: 5000,
		zoneId: 1,
		cardConfigured: true,
		bankConfigured: true,
	};

	test("offers only the online methods, each available in the metro zone", () => {
		expect(reasons(base)).toEqual({
			card: null,
			bank_transfer: null,
			cash_on_delivery: null,
		});
	});

	test("cash on delivery needs an address in its zone and a total within its maximum", () => {
		expect(reasons({ ...base, zoneId: 2 }).cash_on_delivery).toBe(
			"outside_zone",
		);
		expect(reasons({ ...base, zoneId: null }).cash_on_delivery).toBe(
			"address_required",
		);
		expect(reasons({ ...base, total: 15001 }).cash_on_delivery).toBe(
			"over_max_total",
		);
		expect(reasons({ ...base, total: 15000 }).cash_on_delivery).toBeNull();
	});

	test("the card needs the Wompi keys and the transfer the bank details", () => {
		expect(
			reasons({ ...base, cardConfigured: false, bankConfigured: false }),
		).toEqual({
			card: "not_configured",
			bank_transfer: "not_configured",
			cash_on_delivery: null,
		});
	});
});

describe("allocateLines", () => {
	const lots = [
		{ lotId: 2, variantId: 1, available: 3 },
		{ lotId: 1, variantId: 1, available: 1 },
		{ lotId: 3, variantId: 2, available: 5 },
	];

	test("takes the oldest lot first, across every line of the same size", () => {
		expect(
			allocateLines(lots, [
				{ key: "v1", variantId: 1, quantity: 2 },
				{ key: "b1v1", variantId: 1, quantity: 2 },
				{ key: "v2", variantId: 2, quantity: 1 },
			]),
		).toEqual([
			{
				key: "v1",
				taken: [
					{ lotId: 1, quantity: 1 },
					{ lotId: 2, quantity: 1 },
				],
			},
			{ key: "b1v1", taken: [{ lotId: 2, quantity: 2 }] },
			{ key: "v2", taken: [{ lotId: 3, quantity: 1 }] },
		]);
	});

	test("refuses more units than the lots hold", () => {
		expect(() =>
			allocateLines(lots, [
				{ key: "v1", variantId: 1, quantity: 3 },
				{ key: "b1v1", variantId: 1, quantity: 2 },
			]),
		).toThrow(OutOfStockError);
	});
});
