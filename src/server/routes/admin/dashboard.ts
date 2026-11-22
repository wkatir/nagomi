import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, schema } from "#/db";
import { addDays, daysBetween, storeToday } from "#/lib/dates";
import { reportDays } from "#/lib/schemas/reports";
import { validate } from "#/server/validate";
import { overdueOrders } from "../../domain/followups";
import { daysOnSale, unitsPerDay } from "../../domain/insights";
import { COMMITTED_STATUSES } from "../../domain/order-state";
import {
	loadBookings,
	loadFirstSaleDays,
	loadSales,
	utcBounds,
} from "../../domain/report-data";
import { periods } from "../../domain/reports";
import {
	salesByOrderKey,
	salesByProduct,
	salesTotals,
} from "../../domain/sales";
import { getSettings } from "../../domain/settings";
import { lossesReport, reorderVariant, stockReport } from "./reports";

const { orders, productReviews, stockAlerts } = schema;

export const DASHBOARD_DEFAULT_DAYS = 30;
const TOP_PRODUCTS = 5;
const LOW_STOCK_ROWS = 8;
const FOLLOWUP_ROWS = 6;

export const dashboardRouter = new Hono().get(
	"/",
	validate("query", reportDays),
	async (c) => {
		const db = getDb();
		const query = c.req.valid("query");
		const settings = await getSettings(db);
		const { timeZone } = settings;
		const today = storeToday(timeZone);
		const range = {
			from: query.from ?? addDays(today, -(DASHBOARD_DEFAULT_DAYS - 1)),
			to: query.to ?? today,
			timeZone,
		};
		const { start, end } = utcBounds(range);
		const firstOrders = db
			.select({
				customerId: orders.customerId,
				firstAt: sql<string>`min(${orders.createdAt})`.as("first_at"),
			})
			.from(orders)
			.where(
				and(
					inArray(orders.status, [...COMMITTED_STATUSES]),
					isNotNull(orders.customerId),
				),
			)
			.groupBy(orders.customerId)
			.as("first_orders");
		const [
			sales,
			bookings,
			losses,
			stock,
			firstSales,
			followups,
			[pending],
			[newCustomers],
			[reviews],
			[alerts],
		] = await Promise.all([
			loadSales(db, range),
			loadBookings(db, range),
			lossesReport(db, settings, { from: range.from, to: range.to }),
			stockReport(db, settings, { from: range.from, to: range.to }),
			loadFirstSaleDays(db, timeZone),
			overdueOrders(db),
			db
				.select({ count: sql<number>`count(*)` })
				.from(orders)
				.where(eq(orders.status, "pending")),
			db
				.select({ count: sql<number>`count(*)` })
				.from(firstOrders)
				.where(
					and(gte(firstOrders.firstAt, start), lt(firstOrders.firstAt, end)),
				),
			db
				.select({ count: sql<number>`count(*)` })
				.from(productReviews)
				.where(eq(productReviews.status, "pending")),
			db
				.select({ count: sql<number>`count(*)` })
				.from(stockAlerts)
				.where(isNull(stockAlerts.notifiedAt)),
		]);
		if (!pending || !newCustomers || !reviews || !alerts)
			throw new Error("Aggregate returned no row");
		const byDay = salesByOrderKey(sales, (s) => s.day);
		const empty = salesTotals([]);
		const countOf = (action: (typeof followups)[number]["action"]) =>
			followups.filter((f) => f.action === action).length;
		return c.json({
			from: range.from,
			to: range.to,
			days: daysBetween(range.from, range.to) + 1,
			sales: salesTotals(sales),
			bookings,
			newCustomers: newCustomers.count,
			losses: (({ from: _, to: __, ...l }) => l)(losses),
			pendingOrders: pending.count,
			overduePendingOrders: countOf("collect_payment"),
			byDay: periods(range.from, range.to, "day").map((p) => {
				const day = byDay.get(p.period) ?? empty;
				return {
					day: p.period,
					orders: day.orders,
					revenue: day.revenue,
					grossProfit: day.grossProfit,
				};
			}),
			topProducts: salesByProduct(sales)
				.slice(0, TOP_PRODUCTS)
				.map((p) => {
					const firstSoldOn = firstSales.get(p.variantId);
					if (firstSoldOn === undefined)
						throw new Error(`Variant ${p.variantId} sold without a first sale`);
					return {
						...p,
						unitsPerDay: unitsPerDay(p.units, daysOnSale(firstSoldOn, range)),
					};
				}),
			stock: {
				onHand: stock.totals.onHand,
				value: stock.totals.value,
				lowStock: stock.totals.lowStock,
				outOfStock: stock.totals.outOfStock,
				threshold: settings.lowStockThreshold,
			},
			lowStock: stock.variants
				.filter((v) => reorderVariant(v) && v.lowStock)
				.slice(0, LOW_STOCK_ROWS)
				.map((v) => ({
					variantId: v.variantId,
					sku: v.sku,
					brand: v.brand,
					name: v.name,
					onHand: v.onHand,
					reorderPoint: v.reorderPoint ?? settings.lowStockThreshold,
					daysOfCover: v.daysOfCover,
				})),
			followups: {
				counts: {
					collect_payment: countOf("collect_payment"),
					ship: countOf("ship"),
					confirm_delivery: countOf("confirm_delivery"),
				},
				items: followups.slice(0, FOLLOWUP_ROWS),
			},
			pendingReviews: reviews.count,
			pendingStockAlerts: alerts.count,
		});
	},
);
