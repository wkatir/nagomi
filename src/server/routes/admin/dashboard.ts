import { and, eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { addDays, storeToday } from "#/lib/dates";
import { validate } from "#/server/validate";
import { loadBookings, loadSales } from "../../domain/report-data";
import { periods } from "../../domain/reports";
import {
	salesByOrderKey,
	salesByProduct,
	salesTotals,
} from "../../domain/sales";
import { getSettings } from "../../domain/settings";
import { pendingHoldStart } from "../../domain/stock";
import { lossesReport, reorderVariant, stockReport } from "./reports";

const { orders } = schema;

// Computed by the reports module so every figure matches /api/admin/reports for the same
// range.
export const dashboardRouter = new Hono().get(
	"/",
	validate(
		"query",
		z.object({
			days: z.coerce.number().int().min(1).max(365).default(30),
		}),
	),
	async (c) => {
		const db = getDb();
		const query = c.req.valid("query");
		const settings = await getSettings(db);
		const { timeZone } = settings;
		const today = storeToday(timeZone);
		const range = {
			from: addDays(today, -(query.days - 1)),
			to: today,
			timeZone,
		};
		const pendingCount = (where?: ReturnType<typeof and>) =>
			db
				.select({ count: sql<number>`count(*)` })
				.from(orders)
				.where(and(eq(orders.status, "pending"), where));
		const [sales, bookings, losses, stock, [pending], [overdue]] =
			await Promise.all([
				loadSales(db, range),
				loadBookings(db, range),
				lossesReport(db, settings, { from: range.from, to: range.to }),
				stockReport(db, settings),
				pendingCount(),
				// Consumer law: confirm by the next calendar day, so a pending order placed
				// before yesterday is late (and no longer holds stock).
				pendingCount(lt(orders.createdAt, pendingHoldStart(today, timeZone))),
			]);
		if (!pending || !overdue) throw new Error("Aggregate returned no row");
		const byDay = salesByOrderKey(sales, (s) => s.day);
		const empty = salesTotals([]);
		return c.json({
			from: range.from,
			to: range.to,
			days: query.days,
			sales: salesTotals(sales),
			bookings,
			losses: (({ from: _, to: __, ...l }) => l)(losses),
			pendingOrders: pending.count,
			overduePendingOrders: overdue.count,
			byDay: periods(range.from, range.to, "day").map((p) => {
				const day = byDay.get(p.period) ?? empty;
				return {
					day: p.period,
					orders: day.orders,
					revenue: day.revenue,
					grossProfit: day.grossProfit,
				};
			}),
			topProducts: salesByProduct(sales).slice(0, 5),
			stock: {
				...stock.totals,
				lowStock: stock.variants.filter((v) => reorderVariant(v) && v.lowStock)
					.length,
			},
		});
	},
);
