import { describe, expect, test } from "bun:test";
import {
	byPriority,
	orderQuantity,
	type ReorderInput,
	reorderSuggestion,
} from "./reorder";

const TODAY = "2026-10-06";
const params = {
	today: TODAY,
	lookbackWeeks: 8,
	targetWeeks: 4,
};

// 28 kept units over the 56 days ending today: 0.5 a day.
const steady = Array.from({ length: 14 }, (_, i) => ({
	day: `2026-09-${String(i + 10).padStart(2, "0")}`,
	units: 2,
}));

const base: ReorderInput = {
	variantId: 1,
	price: 2400,
	reorderPoint: null,
	sales: steady,
	firstReceivedOn: "2026-01-10",
	lots: [{ available: 10 }],
	committed: 2,
	latestUnitCostE4: 160_745,
	leadTimeDays: 7,
	packSize: null,
	minOrderQuantity: null,
};

describe("reorderSuggestion", () => {
	test("covered: shows the top-up but suggests nothing above the reorder point", () => {
		const s = reorderSuggestion(base, params);
		expect(s).toMatchObject({
			unitsSold: 28,
			daysObserved: 56,
			ratePerDay: 0.5,
			ratePerWeek: 3.5,
			onHand: 10,
			committed: 2,
			backorders: 0,
			usable: 8,
			daysOfCover: 16,
			stockoutOn: "2026-10-22",
			reorderPoint: 4,
			reorderPointSource: "lead_time_demand",
			belowReorderPoint: false,
			orderUpTo: 18,
			gap: 10,
			topUpQuantity: 10,
			suggestedQuantity: 0,
			unitCost: 1607,
			unitMargin: 793,
			urgency: 0.875,
			priorityScore: 0,
			reasons: [],
		});
		expect(s.weeklyUnits).toEqual([0, 0, 0, 0, 12, 14, 2, 0]);
		expect(s.weeklyUnits.reduce((a, b) => a + b, 0)).toBe(28);
	});

	test("below the owner's reorder point", () => {
		const s = reorderSuggestion(
			{
				...base,
				reorderPoint: 8,
				committed: 0,
				lots: [{ available: 6 }, { available: 2 }],
			},
			params,
		);
		expect(s).toMatchObject({
			usable: 8,
			daysOfCover: 16,
			reorderPointSource: "variant",
			belowReorderPoint: true,
			orderUpTo: 22,
			gap: 14,
			suggestedQuantity: 14,
			urgency: 0.875,
			// 0.875 x 3.5 units a week x 7.93 margin
			priorityScore: 2429,
			reasons: ["below_reorder_point"],
		});
	});

	test("backorders are filled first and the order covers the target weeks", () => {
		const s = reorderSuggestion(
			{
				...base,
				price: 1700,
				latestUnitCostE4: 80_000,
				sales: [{ day: "2026-09-01", units: 112 }],
				lots: [],
				committed: 3,
				leadTimeDays: 14,
			},
			{ ...params, targetWeeks: 8 },
		);
		expect(s).toMatchObject({
			ratePerDay: 2,
			onHand: 0,
			backorders: 3,
			usable: -3,
			daysOfCover: 0,
			stockoutOn: TODAY,
			reorderPoint: 28,
			orderUpTo: 140,
			gap: 143,
			suggestedQuantity: 143,
			urgency: 1,
			priorityScore: (14 + 3) * 900,
			reasons: [
				"backordered",
				"below_reorder_point",
				"stockout_within_lead_time",
			],
		});
	});

	test("a variant received inside the lookback is measured since then", () => {
		const s = reorderSuggestion(
			{
				...base,
				firstReceivedOn: "2026-09-23",
				sales: [
					{ day: "2026-09-30", units: 4 },
					{ day: "2026-10-06", units: 3 },
					{ day: "2026-08-11", units: 50 },
				],
			},
			params,
		);
		expect(s.daysObserved).toBe(14);
		expect(s.unitsSold).toBe(7);
		expect(s.ratePerDay).toBe(0.5);
		expect(s.weeklyUnits.at(-1)).toBe(7);
	});

	test("no sales: nothing suggested unless backordered or below the owner's point", () => {
		const idle = {
			...base,
			sales: [],
			committed: 0,
			lots: [{ available: 5 }],
		};
		expect(reorderSuggestion(idle, params)).toMatchObject({
			ratePerDay: 0,
			daysOfCover: null,
			reorderPoint: 0,
			suggestedQuantity: 0,
			reasons: ["no_sales_in_lookback"],
		});
		expect(
			reorderSuggestion({ ...idle, reorderPoint: 6 }, params),
		).toMatchObject({
			suggestedQuantity: 1,
			priorityScore: 0,
		});
		expect(
			reorderSuggestion(
				{ ...idle, lots: [], committed: 2, latestUnitCostE4: null },
				params,
			),
		).toMatchObject({
			backorders: 2,
			suggestedQuantity: 2,
			urgency: 1,
			priorityScore: null,
			reasons: [
				"backordered",
				"below_reorder_point",
				"no_sales_in_lookback",
				"no_cost",
			],
		});
	});

	test("stock that runs out within the lead time is reordered above the point", () => {
		const s = reorderSuggestion(
			{ ...base, reorderPoint: 2, leadTimeDays: 20 },
			params,
		);
		expect(s).toMatchObject({
			daysOfCover: 16,
			reorderPoint: 2,
			belowReorderPoint: false,
			// 2 + 14 - 8
			gap: 8,
			suggestedQuantity: 8,
			reasons: ["stockout_within_lead_time"],
		});
	});

	test("a first day's sales are spread over the minimum window, not extrapolated", () => {
		const s = reorderSuggestion(
			{ ...base, firstReceivedOn: TODAY, sales: [{ day: TODAY, units: 7 }] },
			params,
		);
		expect(s).toMatchObject({ daysObserved: 14, ratePerDay: 0.5 });
		expect(s.reasons).toContain("short_history");
		const short = reorderSuggestion(
			{ ...base, firstReceivedOn: TODAY, sales: [{ day: TODAY, units: 2 }] },
			{ ...params, lookbackWeeks: 1 },
		);
		expect(short.daysObserved).toBe(7);
	});

	test("orders whole packs, at least the minimum, and flags an unknown lead time", () => {
		expect(orderQuantity(0, 6, 12)).toBe(0);
		expect(orderQuantity(5, null, null)).toBe(5);
		expect(orderQuantity(5, 6, null)).toBe(6);
		expect(orderQuantity(13, 6, null)).toBe(18);
		expect(orderQuantity(5, null, 10)).toBe(10);
		expect(orderQuantity(5, 4, 10)).toBe(12);
		const s = reorderSuggestion(
			{
				...base,
				reorderPoint: 10,
				committed: 0,
				packSize: 12,
				minOrderQuantity: 24,
				leadTimeDays: null,
			},
			params,
		);
		// No lead time: counted as 0. Point 10, order up to 10 + 14 = 24, usable 10: gap 14,
		// raised to the minimum of 24, in packs of 12.
		expect(s).toMatchObject({
			leadTimeDays: null,
			usable: 10,
			gap: 14,
			suggestedQuantity: 14,
			orderQuantity: 24,
			reasons: [
				"below_reorder_point",
				"lead_time_unknown",
				"rounded_to_pack_or_minimum",
			],
		});
	});

	test("orders what to buy first", () => {
		const a = reorderSuggestion(base, params);
		const b = { ...a, variantId: 2, suggestedQuantity: 3, priorityScore: 100 };
		const c = { ...a, variantId: 3, suggestedQuantity: 5, priorityScore: null };
		const d = { ...a, variantId: 4, suggestedQuantity: 2, priorityScore: 900 };
		expect([a, b, c, d].sort(byPriority).map((s) => s.variantId)).toEqual([
			4, 2, 3, 1,
		]);
	});
});
