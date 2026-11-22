import { addDays, daysBetween } from "#/lib/dates";
import { e4ToMinor } from "./receiving";

type ReorderParams = {
	today: string;
	lookbackWeeks: number;
	targetWeeks: number;
};

export type ReorderInput = {
	variantId: number;
	// Null while its product is a draft without one.
	price: number | null;
	// Null: derived from lead time.
	reorderPoint: number | null;
	// Fulfilled units net of returns, by local fulfilment day.
	sales: { day: string; units: number }[];
	firstReceivedOn: string | null;
	lots: { available: number }[];
	// Confirmed orders not fulfilled yet: they take stock first.
	committed: number;
	// Of the latest lot bought at a price (free units excluded), in `_e4` units.
	latestUnitCostE4: number | null;
	// The supplier's, or the report's override. Null: counted as 0 and flagged
	// lead_time_unknown.
	leadTimeDays: number | null;
	// Null (or no supplier): no constraint known.
	packSize: number | null;
	minOrderQuantity: number | null;
};

export function orderQuantity(
	suggested: number,
	packSize: number | null,
	minOrderQuantity: number | null,
): number {
	if (suggested <= 0) return 0;
	const units = Math.max(suggested, minOrderQuantity ?? 0);
	const pack = packSize ?? 1;
	return Math.ceil(units / pack) * pack;
}

const REORDER_REASONS = [
	"backordered",
	"below_reorder_point",
	"stockout_within_lead_time",
	"no_sales_in_lookback",
	"no_cost",
	"no_price",
	"lead_time_unknown",
	"short_history",
	"rounded_to_pack_or_minimum",
] as const;
type ReorderReason = (typeof REORDER_REASONS)[number];

const MIN_OBSERVED_DAYS = 14;

const round = (n: number, decimals: number) =>
	Math.round(n * 10 ** decimals) / 10 ** decimals;

export function reorderSuggestion(input: ReorderInput, params: ReorderParams) {
	const { today, lookbackWeeks, targetWeeks } = params;
	const leadTimeDays = input.leadTimeDays ?? 0;
	const lookbackDays = lookbackWeeks * 7;
	const firstDay = addDays(today, -(lookbackDays - 1));
	const weeklyUnits = Array.from({ length: lookbackWeeks }, () => 0);
	let unitsSold = 0;
	for (const s of input.sales) {
		if (s.day < firstDay || s.day > today) continue;
		const weeksAgo = Math.floor(daysBetween(s.day, today) / 7);
		weeklyUnits[lookbackWeeks - 1 - weeksAgo] += s.units;
		unitsSold += s.units;
	}
	// A variant first received inside the lookback has only been on sale since then, but
	// a rate is never taken from fewer days than the minimum window (a first day's sales
	// are not a trend): a short history is spread over the window and flagged.
	const minimumDays = Math.min(MIN_OBSERVED_DAYS, lookbackDays);
	const daysOnSale =
		input.firstReceivedOn !== null && input.firstReceivedOn > firstDay
			? daysBetween(input.firstReceivedOn, today) + 1
			: lookbackDays;
	const shortHistory = daysOnSale < minimumDays;
	const daysObserved = Math.max(daysOnSale, minimumDays);
	const rate = unitsSold / daysObserved;

	const onHand = input.lots.reduce((n, l) => n + l.available, 0);
	const backorders = Math.max(0, input.committed - onHand);
	const usable = onHand - input.committed;
	const daysOfCover = rate > 0 ? Math.max(0, usable) / rate : null;

	const reorderPoint = input.reorderPoint ?? Math.ceil(rate * leadTimeDays);
	const orderUpTo = reorderPoint + Math.ceil(rate * 7 * targetWeeks);
	const gap = Math.max(0, orderUpTo - usable);
	const topUpQuantity =
		rate > 0 || input.reorderPoint !== null ? gap : backorders;
	// A point derived from no sales is 0: only backorders put the variant below it.
	const belowReorderPoint =
		input.reorderPoint !== null || rate > 0
			? usable <= reorderPoint
			: usable < 0;
	const runsOutFirst = daysOfCover !== null && daysOfCover < leadTimeDays;
	const suggestedQuantity =
		belowReorderPoint || backorders > 0 || runsOutFirst ? topUpQuantity : 0;
	const toOrder = orderQuantity(
		suggestedQuantity,
		input.packSize,
		input.minOrderQuantity,
	);

	const unitCost =
		input.latestUnitCostE4 === null ? null : e4ToMinor(input.latestUnitCostE4);
	const unitMargin =
		input.price === null || unitCost === null ? null : input.price - unitCost;
	const urgency =
		usable <= 0 && (rate > 0 || backorders > 0)
			? 1
			: daysOfCover === null
				? 0
				: Math.min(1, (leadTimeDays + 7) / daysOfCover);
	const priorityScore =
		suggestedQuantity === 0
			? 0
			: unitMargin === null
				? null
				: Math.round(urgency * (7 * rate + backorders) * unitMargin);

	const reasons: ReorderReason[] = [];
	if (backorders > 0) reasons.push("backordered");
	if (belowReorderPoint) reasons.push("below_reorder_point");
	if (runsOutFirst) reasons.push("stockout_within_lead_time");
	if (unitsSold === 0) reasons.push("no_sales_in_lookback");
	if (unitCost === null) reasons.push("no_cost");
	if (input.price === null) reasons.push("no_price");
	if (input.leadTimeDays === null) reasons.push("lead_time_unknown");
	if (shortHistory && unitsSold > 0) reasons.push("short_history");
	if (toOrder !== suggestedQuantity) reasons.push("rounded_to_pack_or_minimum");

	return {
		variantId: input.variantId,
		unitsSold,
		weeklyUnits,
		daysObserved,
		ratePerDay: round(rate, 4),
		ratePerWeek: round(rate * 7, 2),
		onHand,
		committed: input.committed,
		backorders,
		usable,
		daysOfCover: daysOfCover === null ? null : round(daysOfCover, 1),
		stockoutOn:
			daysOfCover === null ? null : addDays(today, Math.floor(daysOfCover)),
		reorderPoint,
		reorderPointSource:
			input.reorderPoint === null
				? ("lead_time_demand" as const)
				: ("variant" as const),
		belowReorderPoint,
		orderUpTo,
		gap,
		topUpQuantity,
		suggestedQuantity,
		leadTimeDays: input.leadTimeDays,
		packSize: input.packSize,
		minOrderQuantity: input.minOrderQuantity,
		orderQuantity: toOrder,
		unitPrice: input.price,
		unitCost,
		unitMargin,
		margin:
			unitMargin === null || !input.price
				? null
				: round(unitMargin / input.price, 4),
		urgency: round(urgency, 3),
		priorityScore,
		reasons,
	};
}

type ReorderSuggestion = ReturnType<typeof reorderSuggestion>;

export const byPriority = (a: ReorderSuggestion, b: ReorderSuggestion) =>
	Number(b.suggestedQuantity > 0) - Number(a.suggestedQuantity > 0) ||
	(b.priorityScore ?? -1) - (a.priorityScore ?? -1) ||
	b.suggestedQuantity - a.suggestedQuantity ||
	a.variantId - b.variantId;
