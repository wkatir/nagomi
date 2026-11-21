import { describe, expect, test } from "bun:test";
import { storeFreeShippingFrom, zoneFee } from "./shipping";

const capital = {
	method: "own_delivery" as const,
	fee: 300,
	freeFrom: 5000,
	deliveryDaysMin: 1,
	deliveryDaysMax: 2,
};

describe("zoneFee", () => {
	test("charges the fee below the free amount and waives it from there", () => {
		expect(zoneFee(capital, 4999)).toBe(300);
		expect(zoneFee(capital, 5000)).toBe(0);
	});

	test("always charges a zone without a free amount", () => {
		expect(zoneFee({ ...capital, freeFrom: null }, 1_000_000)).toBe(300);
	});

	test("rejects invalid totals", () => {
		expect(() => zoneFee(capital, -1)).toThrow("Invalid merchandise total");
	});
});

describe("storeFreeShippingFrom", () => {
	test("is the shared amount of every delivery zone", () => {
		expect(
			storeFreeShippingFrom([
				capital,
				{ method: "courier", freeFrom: 5000 },
				{ method: "pickup", freeFrom: null },
			]),
		).toBe(5000);
	});

	test("is null without zones or when zones differ", () => {
		expect(storeFreeShippingFrom([])).toBeNull();
		expect(
			storeFreeShippingFrom([capital, { method: "courier", freeFrom: 7500 }]),
		).toBeNull();
		expect(
			storeFreeShippingFrom([capital, { method: "courier", freeFrom: null }]),
		).toBeNull();
	});
});
