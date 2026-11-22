import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb } from "#/db";
import { addDays, storeToday } from "#/lib/dates";
import {
	GRANULARITIES,
	type Granularity,
	rangeFields,
	rangeIssue,
	reorderFields,
	validRange,
} from "#/lib/schemas/reports";
import type { AdminEnv } from "#/server/auth";
import { validate } from "#/server/validate";
import { groupBy } from "../../domain/group-by";
import {
	customerActivity,
	daysOnSale,
	fulfillment,
	rangeDays,
	stockTurnover,
	unitsPerDay,
} from "../../domain/insights";
import { isLowStock } from "../../domain/inventory-queries";
import { byPriority, reorderSuggestion } from "../../domain/reorder";
import {
	loadBoughtOrders,
	loadBuyers,
	loadFirstSaleDays,
	loadLossMovements,
	loadLotBalances,
	loadPlacedOrders,
	loadRefunds,
	loadReplenishment,
	loadReturnedLines,
	loadSales,
	loadSegmentCounts,
	loadStockBefore,
	loadVariants,
	utcBounds,
} from "../../domain/report-data";
import {
	periodStart,
	periods,
	returnsSummary,
	stockLosses,
	stockPosition,
} from "../../domain/reports";
import {
	salesByBrand,
	salesByOrderKey,
	salesByProduct,
	salesTotals,
} from "../../domain/sales";
import { getSettings, type StoreSettings } from "../../domain/settings";

type Range = { from: string; to: string };

export const rangeQuery = z.object(rangeFields).refine(validRange, rangeIssue);
export const salesQuery = z
	.object({ ...rangeFields, granularity: z.enum(GRANULARITIES) })
	.refine(validRange, rangeIssue);
export const reorderQuery = z.object(reorderFields);

export const reorderVariant = (v: {
	variantStatus: string;
	productStatus: string;
}) => v.variantStatus === "active" && v.productStatus !== "archived";

const today = (settings: StoreSettings) => storeToday(settings.timeZone);

export async function salesReport(
	db: Db,
	settings: StoreSettings,
	q: Range & { granularity: Granularity },
) {
	const sales = await loadSales(db, { ...q, timeZone: settings.timeZone });
	const byPeriod = salesByOrderKey(sales, (s) =>
		periodStart(s.day, q.granularity),
	);
	const empty = salesTotals([]);
	return {
		...q,
		totals: salesTotals(sales),
		periods: periods(q.from, q.to, q.granularity).map((p) => ({
			...p,
			...(byPeriod.get(p.period) ?? empty),
		})),
	};
}

export async function productsReport(
	db: Db,
	settings: StoreSettings,
	q: Range,
) {
	const [sales, firstSales] = await Promise.all([
		loadSales(db, { ...q, timeZone: settings.timeZone }),
		loadFirstSaleDays(db, settings.timeZone),
	]);
	return {
		...q,
		totals: salesTotals(sales),
		products: salesByProduct(sales).map((p) => {
			const firstSoldOn = firstSales.get(p.variantId);
			if (firstSoldOn === undefined)
				throw new Error(`Variant ${p.variantId} sold without a first sale`);
			const days = daysOnSale(firstSoldOn, q);
			return {
				...p,
				firstSoldOn,
				daysOnSale: days,
				unitsPerDay: unitsPerDay(p.units, days),
			};
		}),
	};
}

export async function brandsReport(db: Db, settings: StoreSettings, q: Range) {
	const sales = await loadSales(db, { ...q, timeZone: settings.timeZone });
	return { ...q, totals: salesTotals(sales), brands: salesByBrand(sales) };
}

export async function lossesReport(db: Db, settings: StoreSettings, q: Range) {
	const range = { ...q, timeZone: settings.timeZone };
	const [returned, movements, refunds] = await Promise.all([
		loadReturnedLines(db, range),
		loadLossMovements(db, range),
		loadRefunds(db, range),
	]);
	return {
		...q,
		returns: returnsSummary(returned),
		refunds,
		...stockLosses(movements),
	};
}

export async function stockReport(db: Db, settings: StoreSettings, q: Range) {
	const asOf = today(settings);
	const range = { ...q, timeZone: settings.timeZone };
	const { start, end } = utcBounds(range);
	const [balances, variants, sales, opening, closing] = await Promise.all([
		loadLotBalances(db),
		loadVariants(db, settings.defaultLocale),
		loadSales(db, range),
		loadStockBefore(db, start),
		loadStockBefore(db, end),
	]);
	const { total, byVariant } = stockPosition(balances);
	const soldOf = new Map(
		salesByProduct(sales).map((p) => [p.variantId, p.units] as const),
	);
	const days = rangeDays(q);
	const rows = variants
		.filter((v) => v.variantStatus === "active" || byVariant.has(v.variantId))
		.map((v) => {
			const stock = byVariant.get(v.variantId) ?? { onHand: 0, value: 0 };
			const unitsSold = soldOf.get(v.variantId) ?? 0;
			return {
				variantId: v.variantId,
				sku: v.sku,
				brand: v.brand,
				name: v.name,
				variantStatus: v.variantStatus,
				productStatus: v.productStatus,
				reorderPoint: v.reorderPoint,
				lowStock: isLowStock(
					stock.onHand,
					v.reorderPoint,
					settings.lowStockThreshold,
				),
				outOfStock: stock.onHand === 0,
				unitsSold,
				...stockTurnover({
					unitsSold,
					opening: opening.get(v.variantId) ?? 0,
					closing: closing.get(v.variantId) ?? 0,
					onHand: stock.onHand,
					days,
				}),
				...stock,
			};
		});
	const sold = rows.reduce((n, r) => n + r.unitsSold, 0);
	const totalTurnover = stockTurnover({
		unitsSold: sold,
		opening: [...opening.values()].reduce((a, b) => a + b, 0),
		closing: [...closing.values()].reduce((a, b) => a + b, 0),
		onHand: total.onHand,
		days,
	});
	return {
		...q,
		asOf,
		lowStockThreshold: settings.lowStockThreshold,
		totals: {
			...total,
			unitsSold: sold,
			rotation: totalTurnover.rotation,
			daysOfCover: totalTurnover.daysOfCover,
			outOfStock: rows.filter((r) => reorderVariant(r) && r.outOfStock).length,
			lowStock: rows.filter((r) => reorderVariant(r) && r.lowStock).length,
		},
		variants: rows.sort(byUrgency),
	};
}

const urgencyRank = (v: { outOfStock: boolean; lowStock: boolean }) =>
	v.outOfStock ? 0 : v.lowStock ? 1 : 2;

const byUrgency = (
	a: {
		outOfStock: boolean;
		lowStock: boolean;
		daysOfCover: number | null;
		sku: string;
	},
	b: {
		outOfStock: boolean;
		lowStock: boolean;
		daysOfCover: number | null;
		sku: string;
	},
) =>
	urgencyRank(a) - urgencyRank(b) ||
	(a.daysOfCover ?? Number.POSITIVE_INFINITY) -
		(b.daysOfCover ?? Number.POSITIVE_INFINITY) ||
	a.sku.localeCompare(b.sku);

export async function customersReport(
	db: Db,
	settings: StoreSettings,
	q: Range,
) {
	const range = { ...q, timeZone: settings.timeZone };
	const [orders, segments] = await Promise.all([
		loadBoughtOrders(db, range),
		loadSegmentCounts(db),
	]);
	const buyers = await loadBuyers(db, [
		...new Set(orders.map((o) => o.customerId)),
	]);
	return {
		...q,
		...customerActivity(orders, buyers, utcBounds(range), segments),
	};
}

export async function fulfillmentReport(
	db: Db,
	settings: StoreSettings,
	q: Range,
) {
	const orders = await loadPlacedOrders(db, {
		...q,
		timeZone: settings.timeZone,
	});
	return { ...q, ...fulfillment(orders, today(settings)) };
}

export async function reorderReport(
	db: Db,
	settings: StoreSettings,
	q: z.infer<typeof reorderQuery>,
) {
	const asOf = today(settings);
	const lookbackFrom = addDays(asOf, -(q.lookbackWeeks * 7 - 1));
	const [variants, balances, sales, replenishment] = await Promise.all([
		loadVariants(db, settings.defaultLocale),
		loadLotBalances(db),
		loadSales(db, {
			from: lookbackFrom,
			to: asOf,
			timeZone: settings.timeZone,
		}),
		loadReplenishment(db),
	]);
	const salesOf = groupBy(
		sales.flatMap((s) => s.lines),
		(l) => l.variantId,
	);
	const lotsOf = groupBy(balances, (b) => b.variantId);
	const params = {
		today: asOf,
		lookbackWeeks: q.lookbackWeeks,
		targetWeeks: q.targetWeeks,
	};
	return {
		asOf,
		lookbackFrom,
		...params,
		leadTimeOverride: q.leadTimeDays ?? null,
		variants: variants
			.filter(reorderVariant)
			.map((v) => {
				const supplier = replenishment.supplier.get(v.variantId) ?? null;
				const leadTimeDays = q.leadTimeDays ?? supplier?.leadTimeDays ?? null;
				return {
					sku: v.sku,
					brand: v.brand,
					name: v.name,
					productStatus: v.productStatus,
					supplier,
					leadTimeSource:
						q.leadTimeDays !== undefined
							? ("query" as const)
							: supplier?.leadTimeDays != null
								? ("supplier" as const)
								: null,
					...reorderSuggestion(
						{
							variantId: v.variantId,
							price: v.price,
							reorderPoint: v.reorderPoint,
							sales: (salesOf.get(v.variantId) ?? []).map((l) => ({
								day: l.day,
								units: l.units,
							})),
							firstReceivedOn:
								replenishment.firstReceivedOn.get(v.variantId) ?? null,
							lots: lotsOf.get(v.variantId) ?? [],
							committed: 0,
							latestUnitCostE4:
								replenishment.latestUnitCostE4.get(v.variantId) ?? null,
							leadTimeDays,
							packSize: supplier?.packSize ?? null,
							minOrderQuantity: supplier?.minOrderQuantity ?? null,
						},
						params,
					),
				};
			})
			.sort(byPriority),
	};
}

export const reportsRouter = new Hono<AdminEnv>()
	.get("/sales", validate("query", salesQuery), async (c) => {
		const db = getDb();
		return c.json(
			await salesReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/products", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		return c.json(
			await productsReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/brands", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		return c.json(
			await brandsReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/losses", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		return c.json(
			await lossesReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/stock", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		return c.json(
			await stockReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/customers", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		return c.json(
			await customersReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/fulfillment", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		return c.json(
			await fulfillmentReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/reorder", validate("query", reorderQuery), async (c) => {
		const db = getDb();
		return c.json(
			await reorderReport(db, await getSettings(db), c.req.valid("query")),
		);
	});
