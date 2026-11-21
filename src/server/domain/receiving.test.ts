import { describe, expect, test } from "bun:test";
import {
	allocateLandedCost,
	e4ToMinor,
	ReceiptExceedsOrderedError,
	receiptDateProblem,
	receiptOutcome,
} from "./receiving";

describe("allocateLandedCost", () => {
	test("without shipping the lot cost is the supplier price", () => {
		expect(allocateLandedCost([{ quantity: 8, unitCost: 1551 }], 0)).toEqual([
			{ allocatedShippingE4: 0, unitCostE4: 155_100 },
		]);
	});

	test("spreads shipping by line value and adds up exactly", () => {
		// Sugar Glamour order: 8 x 15.51, 2 x 15.91, 4 x 7.20, 7 x 9.48 with $5.00 freight.
		const lines = [
			{ quantity: 8, unitCost: 1551 },
			{ quantity: 2, unitCost: 1591 },
			{ quantity: 4, unitCost: 720 },
			{ quantity: 7, unitCost: 948 },
		];
		const landed = allocateLandedCost(lines, 500);
		expect(landed.reduce((n, l) => n + l.allocatedShippingE4, 0)).toBe(50_000);
		// Value 124.08 of 251.06 -> 49.42% of the freight.
		expect(landed[0].allocatedShippingE4).toBe(24_711);
		const shippingPerUnit = landed.map(
			(l, i) => l.unitCostE4 - lines[i].unitCost * 100,
		);
		// Every unit carries the same freight per dollar of value.
		const perDollar = shippingPerUnit.map((s, i) => s / lines[i].unitCost);
		for (const r of perDollar) expect(r).toBeCloseTo(perDollar[0], 1);
	});

	test("rounds the unit cost half up to 1/10,000", () => {
		// $3.00 over 7 units of one line: 42.857... cents each.
		expect(allocateLandedCost([{ quantity: 7, unitCost: 1000 }], 300)).toEqual([
			{ allocatedShippingE4: 30_000, unitCostE4: 104_286 },
		]);
	});

	test("splits by quantity when every line is free", () => {
		expect(
			allocateLandedCost(
				[
					{ quantity: 1, unitCost: 0 },
					{ quantity: 2, unitCost: 0 },
				],
				1,
			),
		).toEqual([
			{ allocatedShippingE4: 33, unitCostE4: 33 },
			{ allocatedShippingE4: 67, unitCostE4: 34 },
		]);
	});

	test("rejects invalid input", () => {
		expect(() => allocateLandedCost([], 100)).toThrow("at least one line");
		expect(() => allocateLandedCost([{ quantity: 0, unitCost: 1 }], 0)).toThrow(
			"Invalid receipt line",
		);
		expect(() =>
			allocateLandedCost([{ quantity: 1, unitCost: 1 }], -1),
		).toThrow("Invalid shipping cost");
	});
});

describe("e4ToMinor", () => {
	test("rounds to the nearest cent", () => {
		expect(e4ToMinor(104_286)).toBe(1043);
		expect(e4ToMinor(104_249)).toBe(1042);
		expect(e4ToMinor(104_250)).toBe(1043);
		expect(e4ToMinor(-104_250)).toBe(-1043);
	});
});

describe("receiptOutcome", () => {
	const items = [
		{ id: 1, ordered: 8, received: 0 },
		{ id: 2, ordered: 2, received: 2 },
	];

	test("is partially received until every unit arrived", () => {
		expect(
			receiptOutcome(items, [{ purchaseOrderItemId: 1, quantity: 5 }]),
		).toBe("partially_received");
		expect(
			receiptOutcome(items, [
				{ purchaseOrderItemId: 1, quantity: 5 },
				{ purchaseOrderItemId: 1, quantity: 3 },
			]),
		).toBe("received");
	});

	test("refuses more than what is still expected", () => {
		expect(() =>
			receiptOutcome(items, [{ purchaseOrderItemId: 2, quantity: 1 }]),
		).toThrow(ReceiptExceedsOrderedError);
	});

	test("refuses items of another purchase order", () => {
		expect(() =>
			receiptOutcome(items, [{ purchaseOrderItemId: 9, quantity: 1 }]),
		).toThrow("not in the purchase order");
	});
});

describe("receiptDateProblem", () => {
	const ok = {
		receivedOn: "2026-10-05",
		orderedOn: "2026-10-03",
		today: "2026-10-05",
		expiries: ["2027-05-31", "2026-10-05"],
	};

	test("accepts a delivery dated today with lots expiring today or later", () => {
		expect(receiptDateProblem(ok)).toBeNull();
		expect(receiptDateProblem({ ...ok, orderedOn: null })).toBeNull();
	});

	test("refuses future dates, dates before the order and expired lots", () => {
		expect(receiptDateProblem({ ...ok, receivedOn: "2026-10-06" })).toBe(
			"received_on_in_future",
		);
		expect(receiptDateProblem({ ...ok, receivedOn: "2026-10-02" })).toBe(
			"received_before_ordered",
		);
		expect(receiptDateProblem({ ...ok, expiries: ["2026-10-04"] })).toBe(
			"lot_expired_at_receipt",
		);
	});
});
