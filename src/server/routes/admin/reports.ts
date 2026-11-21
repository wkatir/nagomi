import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb } from "#/db";
import { addDays, daysBetween, storeToday } from "#/lib/dates";
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
import { formatExpiry } from "../../domain/expiry";
import { groupBy } from "../../domain/group-by";
import { e4ToMinor } from "../../domain/receiving";
import { byPriority, reorderSuggestion } from "../../domain/reorder";
import {
	loadLossMovements,
	loadLotBalances,
	loadRefunds,
	loadReplenishment,
	loadReturnedLines,
	loadSales,
	loadVariants,
} from "../../domain/report-data";
import {
	expiresWithin,
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
import { pendingHoldStart } from "../../domain/stock";

type Range = { from: string; to: string };

export const rangeQuery = z.object(rangeFields).refine(validRange, rangeIssue);
export const salesQuery = z
	.object({ ...rangeFields, granularity: z.enum(GRANULARITIES) })
	.refine(validRange, rangeIssue);
export const stockQuery = z.object({
	expiryWindowDays: z.coerce.number().int().min(1).max(3650).optional(),
});
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
	const sales = await loadSales(db, { ...q, timeZone: settings.timeZone });
	return { ...q, totals: salesTotals(sales), products: salesByProduct(sales) };
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

export async function stockReport(
	db: Db,
	settings: StoreSettings,
	q: z.infer<typeof stockQuery>,
) {
	const asOf = today(settings);
	const expiryWindowDays = q.expiryWindowDays ?? settings.expiryWarningDays;
	const [balances, variants] = await Promise.all([
		loadLotBalances(db),
		loadVariants(db, settings.defaultLocale),
	]);
	const { total, byVariant } = stockPosition(balances, asOf, expiryWindowDays);
	const named = new Map(variants.map((v) => [v.variantId, v]));
	return {
		asOf,
		expiryWindowDays,
		totals: total,
		variants: variants
			.filter((v) => v.variantStatus === "active" || byVariant.has(v.variantId))
			.map((v) => {
				const stock = byVariant.get(v.variantId) ?? {
					onHand: 0,
					value: 0,
					atRiskUnits: 0,
					atRiskValue: 0,
					expiredUnits: 0,
					expiredValue: 0,
				};
				return {
					variantId: v.variantId,
					sku: v.sku,
					brand: v.brand,
					name: v.name,
					variantStatus: v.variantStatus,
					productStatus: v.productStatus,
					reorderPoint: v.reorderPoint,
					belowReorderPoint:
						v.reorderPoint !== null && stock.onHand <= v.reorderPoint,
					...stock,
				};
			}),
		expiringLots: balances
			.filter(
				(l) =>
					l.available > 0 && expiresWithin(l.expiresOn, asOf, expiryWindowDays),
			)
			.map((l) => {
				const v = named.get(l.variantId);
				if (!v) throw new Error(`Lot ${l.lotId} has no variant`);
				return {
					lotId: l.lotId,
					code: l.code,
					variantId: l.variantId,
					sku: v.sku,
					brand: v.brand,
					name: v.name,
					expiresOn: l.expiresOn,
					expiry: formatExpiry(l.expiresOn, l.expiryPrecision),
					daysLeft: daysBetween(asOf, l.expiresOn),
					available: l.available,
					value: e4ToMinor(l.available * l.unitCostE4),
				};
			}),
	};
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
		loadReplenishment(db, pendingHoldStart(asOf, settings.timeZone)),
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
		minShelfLifeDays: settings.minShelfLifeDays,
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
							committed: replenishment.committed.get(v.variantId) ?? 0,
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
	.get("/stock", validate("query", stockQuery), async (c) => {
		const db = getDb();
		return c.json(
			await stockReport(db, await getSettings(db), c.req.valid("query")),
		);
	})
	.get("/reorder", validate("query", reorderQuery), async (c) => {
		const db = getDb();
		return c.json(
			await reorderReport(db, await getSettings(db), c.req.valid("query")),
		);
	});
