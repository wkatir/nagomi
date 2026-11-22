import { describe, expect, test } from "bun:test";
import {
	periodEnd,
	periodStart,
	periods,
	returnsSummary,
	stockLosses,
	stockPosition,
} from "./reports";

describe("periods", () => {
	test("weeks start on Monday, months on the 1st", () => {
		// 2026-10-06 is a Tuesday.
		expect(periodStart("2026-10-06", "week")).toBe("2026-10-05");
		expect(periodStart("2026-10-05", "week")).toBe("2026-10-05");
		expect(periodStart("2026-10-04", "week")).toBe("2026-09-28");
		expect(periodStart("1969-12-31", "week")).toBe("1969-12-29");
		expect(periodStart("2026-10-06", "month")).toBe("2026-10-01");
		expect(periodEnd("2026-02-01", "month")).toBe("2026-02-28");
		expect(periodEnd("2028-02-01", "month")).toBe("2028-02-29");
		expect(periodEnd("2026-12-01", "month")).toBe("2026-12-31");
		expect(periodEnd("2026-09-28", "week")).toBe("2026-10-04");
	});

	test("cover the range, clipped and flagged at the edges", () => {
		expect(periods("2026-09-30", "2026-10-13", "week")).toEqual([
			{
				period: "2026-09-28",
				from: "2026-09-30",
				to: "2026-10-04",
				partial: true,
			},
			{
				period: "2026-10-05",
				from: "2026-10-05",
				to: "2026-10-11",
				partial: false,
			},
			{
				period: "2026-10-12",
				from: "2026-10-12",
				to: "2026-10-13",
				partial: true,
			},
		]);
		expect(
			periods("2026-11-30", "2027-01-01", "month").map((p) => p.period),
		).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
		expect(periods("2026-10-01", "2026-10-03", "day")).toHaveLength(3);
		expect(() => periods("2026-10-02", "2026-10-01", "day")).toThrow();
	});
});

describe("stockPosition", () => {
	test("values the stock at lot cost", () => {
		const { total, byVariant } = stockPosition([
			{
				lotId: 1,
				variantId: 1,
				available: 2,
				unitCostE4: 80_000,
			},
			{
				lotId: 2,
				variantId: 1,
				available: 3,
				unitCostE4: 80_050,
			},
			{
				lotId: 3,
				variantId: 1,
				available: 4,
				unitCostE4: 85_000,
			},
			{
				lotId: 4,
				variantId: 2,
				available: 1,
				unitCostE4: 160_745,
			},
			{
				lotId: 5,
				variantId: 2,
				available: 0,
				unitCostE4: 1,
			},
		]);
		expect(total).toEqual({
			onHand: 10,
			// 2 x 8.00 + 3 x 8.005 + 4 x 8.50 + 16.0745 = 90.0895
			value: 9009,
		});
		expect(byVariant.get(2)).toEqual({ onHand: 1, value: 1607 });
	});
});

describe("stockLosses", () => {
	test("write-offs by reason and signed adjustments", () => {
		const r = stockLosses([
			{
				kind: "waste",
				reason: "customer_return",
				quantity: -1,
				unitCostE4: 160_745,
			},
			{ kind: "waste", reason: "damaged", quantity: -2, unitCostE4: 80_000 },
			{
				kind: "waste",
				reason: "customer_return",
				quantity: -1,
				unitCostE4: 80_000,
			},
			{
				kind: "adjustment",
				reason: "lost_theft",
				quantity: -1,
				unitCostE4: 50_000,
			},
			{
				kind: "adjustment",
				reason: "count_difference",
				quantity: 2,
				unitCostE4: 10_000,
			},
		]);
		expect(r).toEqual({
			writeOffs: {
				units: 4,
				cost: 4007,
				byReason: [
					{ reason: "customer_return", units: 2, cost: 2407 },
					{ reason: "damaged", units: 2, cost: 1600 },
				],
			},
			adjustments: { units: 1, value: -300 },
			totalLoss: 4307,
		});
	});

	test("a write-off without a reason is a broken ledger, not an 'unspecified' row", () => {
		expect(() =>
			stockLosses([
				{ kind: "waste", reason: null, quantity: -1, unitCostE4: 10_000 },
			]),
		).toThrow("Waste must have a reason");
	});
});

describe("returnsSummary", () => {
	test("splits restocked and written-off cost", () => {
		const r = returnsSummary([
			{
				returnId: 1,
				reason: "withdrawal",
				disposition: "restock",
				quantity: 1,
				unitPrice: 1700,
				unitCostE4: 80_000,
			},
			{
				returnId: 1,
				reason: "withdrawal",
				disposition: "write_off",
				quantity: 1,
				unitPrice: 2400,
				unitCostE4: 160_745,
			},
			{
				returnId: 2,
				reason: "delivery_failed",
				disposition: "restock",
				quantity: 2,
				unitPrice: 1900,
				unitCostE4: 110_000,
			},
		]);
		expect(r).toEqual({
			returns: 2,
			units: 4,
			value: 1700 + 2400 + 3800,
			restocked: { units: 3, cost: 3000 },
			writtenOff: { units: 1, cost: 1607 },
			byReason: [
				{ reason: "withdrawal", returns: 1, units: 2, value: 4100 },
				{ reason: "delivery_failed", returns: 1, units: 2, value: 3800 },
			],
		});
	});
});
