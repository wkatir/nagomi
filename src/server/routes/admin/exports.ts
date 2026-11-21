import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb } from "#/db";
import { storeToday } from "#/lib/dates";
import { customerFilters } from "#/lib/schemas/customers";
import { movementFilters } from "#/lib/schemas/inventory";
import { orderFilters } from "#/lib/schemas/orders";
import type { AdminEnv } from "#/server/auth";
import { exportLimit } from "#/server/rate-limit";
import { validate } from "#/server/validate";
import {
	type Cell,
	csvDateTime,
	csvHeaders,
	csvMoney,
	csvStream,
} from "../../domain/csv";
import { listCustomers } from "../../domain/customer-queries";
import { listOrders } from "../../domain/order-queries";
import { getSettings, type StoreSettings } from "../../domain/settings";
import { listMovements } from "./inventory";
import {
	brandsReport,
	lossesReport,
	productsReport,
	rangeQuery,
	reorderQuery,
	reorderReport,
	salesQuery,
	salesReport,
	stockQuery,
	stockReport,
} from "./reports";

type Rows = Cell[][];

// The total row's money comes from the exact sum (lot costs rounded once), so it can
// differ by a cent from the sum of the rounded rows above.
const totalsOption = z.object({ totals: z.enum(["true", "false"]).optional() });

type Page<C> = { rows: Rows; next: C | null };

// Reads the first page before the response starts, so a failure is still an error
// response; later pages are read as the client downloads.
async function paged<C>(
	page: (cursor: C | null) => Promise<Page<C>>,
): Promise<AsyncIterable<Rows>> {
	const first = await page(null);
	return (async function* () {
		let current = first;
		for (;;) {
			yield current.rows;
			if (current.next === null) return;
			current = await page(current.next);
		}
	})();
}

async function* once(rows: Rows): AsyncGenerator<Rows> {
	yield rows;
}

const PAGE = 100;

function download(
	settings: StoreSettings,
	name: string,
	header: string[],
	pages: AsyncIterable<Rows>,
) {
	const today = storeToday(settings.timeZone);
	return new Response(csvStream(header, pages), {
		headers: csvHeaders(`${name}-${today}.csv`),
	});
}

const size = (value: number | null, unit: string | null) =>
	value === null || unit === null ? null : `${value} ${unit}`;

async function context(db: Db) {
	const settings = await getSettings(db);
	const money = (n: number | null) =>
		n === null ? null : csvMoney(n, settings.currency);
	const at = (instant: string | null) =>
		csvDateTime(instant, settings.timeZone);
	return { settings, money, at };
}

export const exportsRouter = new Hono<AdminEnv>()
	.use("*", exportLimit)
	.get("/orders.csv", validate("query", orderFilters), async (c) => {
		const db = getDb();
		const filters = c.req.valid("query");
		const { settings, money, at } = await context(db);
		return download(
			settings,
			"orders",
			[
				"code",
				"status",
				"channel",
				"created_at",
				"confirmed_at",
				"fulfilled_at",
				"delivered_at",
				"cancelled_at",
				"customer_name",
				"customer_phone",
				"payment_method",
				"payment_status",
				"units",
				"units_returned",
				"subtotal",
				"discount",
				"discount_reason",
				"shipping",
				"total",
				"owed_after_returns",
				"paid",
				"refunded",
				"balance",
				"shipping_method",
				"shipping_zone",
				"delivery_from",
				"delivery_to",
				"ship_to",
				"cancel_reason",
				"notes",
			],
			await paged<string>(async (cursor) => {
				const page = await listOrders(
					db,
					settings.timeZone,
					filters,
					cursor,
					PAGE,
				);
				return {
					next: page.nextCursor,
					rows: page.orders.map((o) => [
						o.code,
						o.status,
						o.channel,
						at(o.createdAt),
						at(o.confirmedAt),
						at(o.fulfilledAt),
						at(o.deliveredAt),
						at(o.cancelledAt),
						o.customerName,
						o.customerPhone,
						o.paymentMethod,
						o.payment.status,
						o.items.reduce((n, i) => n + i.quantity, 0),
						o.items.reduce((n, i) => n + i.returned, 0),
						money(o.subtotal),
						money(o.discount),
						o.discountReason,
						money(o.shipping),
						money(o.total),
						money(o.payment.owed),
						money(o.payment.paid),
						money(o.payment.refunded),
						money(o.payment.balance),
						o.shippingMethod,
						o.shippingZoneName,
						o.deliveryEstimateFrom,
						o.deliveryEstimateTo,
						o.shipTo,
						o.cancelReason,
						o.notes,
					]),
				};
			}),
		);
	})
	.get("/order-lines.csv", validate("query", orderFilters), async (c) => {
		const db = getDb();
		const filters = c.req.valid("query");
		const { settings, money, at } = await context(db);
		return download(
			settings,
			"order-lines",
			[
				"order_code",
				"order_status",
				"created_at",
				"fulfilled_at",
				"sku",
				"brand",
				"product",
				"size",
				"quantity",
				"returned",
				"kept",
				"unit_price",
				"line_total",
			],
			await paged<string>(async (cursor) => {
				const page = await listOrders(
					db,
					settings.timeZone,
					filters,
					cursor,
					PAGE,
				);
				return {
					next: page.nextCursor,
					rows: page.orders.flatMap((o) =>
						o.items.map((i) => [
							o.code,
							o.status,
							at(o.createdAt),
							at(o.fulfilledAt),
							i.sku,
							i.brandName,
							i.name,
							size(i.sizeValue, i.sizeUnit),
							i.quantity,
							i.returned,
							i.quantity - i.returned,
							money(i.unitPrice),
							money(i.quantity * i.unitPrice),
						]),
					),
				};
			}),
		);
	})
	.get("/customers.csv", validate("query", customerFilters), async (c) => {
		const db = getDb();
		const { q } = c.req.valid("query");
		const { settings, money, at } = await context(db);
		return download(
			settings,
			"customers",
			[
				"id",
				"name",
				"phone",
				"email",
				"created_at",
				"orders",
				"lifetime_value",
				"net_paid",
				"balance",
				"first_order_at",
				"last_order_at",
				"marketing_whatsapp",
				"notes",
			],
			await paged<number>(async (cursor) => {
				const page = await listCustomers(db, q, cursor, PAGE);
				return {
					next: page.nextCursor,
					rows: page.customers.map((x) => [
						x.id,
						x.name,
						x.phoneE164,
						x.email,
						at(x.createdAt),
						x.orders,
						money(x.lifetimeValue),
						money(x.netPaid),
						money(x.balance),
						at(x.firstOrderAt),
						at(x.lastOrderAt),
						x.consents.find((k) => k.purpose === "marketing_whatsapp")
							?.granted ?? null,
						x.notes,
					]),
				};
			}),
		);
	})
	.get("/movements.csv", validate("query", movementFilters), async (c) => {
		const db = getDb();
		const filters = c.req.valid("query");
		const { settings, money, at } = await context(db);
		return download(
			settings,
			"inventory-movements",
			[
				"id",
				"created_at",
				"kind",
				"quantity",
				"reason",
				"note",
				"sku",
				"lot_id",
				"lot_code",
				"expiry",
				"order_code",
				"unit_cost",
				"value",
				"recorded_by",
			],
			await paged<number>(async (cursor) => {
				const page = await listMovements(
					db,
					settings,
					filters,
					cursor,
					PAGE * 2,
				);
				return {
					next: page.nextCursor,
					rows: page.items.map((m) => [
						m.id,
						at(m.createdAt),
						m.kind,
						m.quantity,
						m.reason,
						m.note,
						m.sku,
						m.lotId,
						m.lotCode,
						m.expiry,
						m.orderCode,
						money(m.unitCost),
						money(m.value),
						m.createdByName ?? m.createdBy,
					]),
				};
			}),
		);
	})
	.get(
		"/reports/sales.csv",
		validate("query", salesQuery.and(totalsOption)),
		async (c) => {
			const db = getDb();
			const { settings, money } = await context(db);
			const { totals, ...q } = c.req.valid("query");
			const r = await salesReport(db, settings, q);
			return download(
				settings,
				"sales",
				[
					"period",
					"from",
					"to",
					"partial",
					"orders",
					"units",
					"revenue",
					"merchandise",
					"shipping",
					"cost_of_goods_sold",
					"gross_profit",
					"margin",
				],
				once([
					...r.periods.map((p) => [
						p.period,
						p.from,
						p.to,
						p.partial,
						p.orders,
						p.units,
						money(p.revenue),
						money(p.merchandise),
						money(p.shipping),
						money(p.costOfGoodsSold),
						money(p.grossProfit),
						p.margin,
					]),
					...(totals === "true"
						? [
								[
									"total",
									r.from,
									r.to,
									false,
									r.totals.orders,
									r.totals.units,
									money(r.totals.revenue),
									money(r.totals.merchandise),
									money(r.totals.shipping),
									money(r.totals.costOfGoodsSold),
									money(r.totals.grossProfit),
									r.totals.margin,
								],
							]
						: []),
				]),
			);
		},
	)
	.get(
		"/reports/products.csv",
		validate("query", rangeQuery.and(totalsOption)),
		async (c) => {
			const db = getDb();
			const { settings, money } = await context(db);
			const { totals, ...q } = c.req.valid("query");
			const r = await productsReport(db, settings, q);
			const rows = r.products;
			return download(
				settings,
				"sales-by-product",
				[
					"sku",
					"brand",
					"product",
					"orders",
					"units_sold",
					"units_returned",
					"units",
					"merchandise",
					"cost_of_goods_sold",
					"gross_profit",
					"margin",
				],
				once([
					...rows.map((p) => [
						p.sku,
						p.brand,
						p.name,
						p.orders,
						p.unitsSold,
						p.unitsReturned,
						p.units,
						money(p.merchandise),
						money(p.costOfGoodsSold),
						money(p.grossProfit),
						p.margin,
					]),
					...(totals === "true"
						? [
								[
									"total",
									null,
									null,
									r.totals.orders,
									rows.reduce((n, p) => n + p.unitsSold, 0),
									rows.reduce((n, p) => n + p.unitsReturned, 0),
									r.totals.units,
									money(r.totals.merchandise),
									money(r.totals.costOfGoodsSold),
									money(r.totals.grossProfit),
									r.totals.margin,
								],
							]
						: []),
				]),
			);
		},
	)
	.get(
		"/reports/brands.csv",
		validate("query", rangeQuery.and(totalsOption)),
		async (c) => {
			const db = getDb();
			const { settings, money } = await context(db);
			const { totals, ...q } = c.req.valid("query");
			const r = await brandsReport(db, settings, q);
			const rows = r.brands;
			return download(
				settings,
				"sales-by-brand",
				[
					"brand",
					"products",
					"orders",
					"units_sold",
					"units_returned",
					"units",
					"merchandise",
					"cost_of_goods_sold",
					"gross_profit",
					"margin",
				],
				once([
					...rows.map((b) => [
						b.brand,
						b.products,
						b.orders,
						b.unitsSold,
						b.unitsReturned,
						b.units,
						money(b.merchandise),
						money(b.costOfGoodsSold),
						money(b.grossProfit),
						b.margin,
					]),
					...(totals === "true"
						? [
								[
									"total",
									null,
									r.totals.orders,
									rows.reduce((n, b) => n + b.unitsSold, 0),
									rows.reduce((n, b) => n + b.unitsReturned, 0),
									r.totals.units,
									money(r.totals.merchandise),
									money(r.totals.costOfGoodsSold),
									money(r.totals.grossProfit),
									r.totals.margin,
								],
							]
						: []),
				]),
			);
		},
	)
	.get("/reports/losses.csv", validate("query", rangeQuery), async (c) => {
		const db = getDb();
		const { settings, money } = await context(db);
		const r = await lossesReport(db, settings, c.req.valid("query"));
		return download(
			settings,
			"returns-and-write-offs",
			["section", "reason", "count", "units", "amount"],
			once([
				...r.returns.byReason.map((x) => [
					"returns_at_order_price",
					x.reason,
					x.returns,
					x.units,
					money(x.value),
				]),
				[
					"returns_restocked_at_cost",
					null,
					null,
					r.returns.restocked.units,
					money(r.returns.restocked.cost),
				],
				[
					"returns_written_off_at_cost",
					null,
					null,
					r.returns.writtenOff.units,
					money(r.returns.writtenOff.cost),
				],
				["refunds", null, r.refunds.count, null, money(r.refunds.amount)],
				...r.writeOffs.byReason.map((x) => [
					"write_offs_at_cost",
					x.reason,
					null,
					x.units,
					money(x.cost),
				]),
				[
					"adjustments_at_cost",
					null,
					null,
					r.adjustments.units,
					money(r.adjustments.value),
				],
				["total_loss_at_cost", null, null, null, money(r.totalLoss)],
			]),
		);
	})
	.get("/reports/stock.csv", validate("query", stockQuery), async (c) => {
		const db = getDb();
		const { settings, money } = await context(db);
		const r = await stockReport(db, settings, c.req.valid("query"));
		return download(
			settings,
			"stock",
			[
				"sku",
				"brand",
				"product",
				"variant_status",
				"on_hand",
				"value_at_cost",
				"expiring_units",
				"expiring_value",
				"expired_units",
				"expired_value",
				"reorder_point",
				"below_reorder_point",
			],
			once(
				r.variants.map((v) => [
					v.sku,
					v.brand,
					v.name,
					v.variantStatus,
					v.onHand,
					money(v.value),
					v.atRiskUnits,
					money(v.atRiskValue),
					v.expiredUnits,
					money(v.expiredValue),
					v.reorderPoint,
					v.belowReorderPoint,
				]),
			),
		);
	})
	.get("/reports/reorder.csv", validate("query", reorderQuery), async (c) => {
		const db = getDb();
		const { settings, money } = await context(db);
		const r = await reorderReport(db, settings, c.req.valid("query"));
		return download(
			settings,
			"reorder",
			[
				"sku",
				"brand",
				"product",
				"suggested_quantity",
				"order_quantity",
				"supplier",
				"supplier_sku",
				"pack_size",
				"min_order_quantity",
				"lead_time_days",
				"lead_time_source",
				"priority_score",
				"units_sold",
				"per_week",
				"on_hand",
				"committed",
				"projected_expiring",
				"usable",
				"days_of_cover",
				"stockout_on",
				"reorder_point",
				"order_up_to",
				"shelf_life_cap",
				"unit_price",
				"unit_cost",
				"unit_margin",
				"reasons",
			],
			once(
				r.variants.map((v) => [
					v.sku,
					v.brand,
					v.name,
					v.suggestedQuantity,
					v.orderQuantity,
					v.supplier?.supplier ?? null,
					v.supplier?.supplierSku ?? null,
					v.packSize,
					v.minOrderQuantity,
					v.leadTimeDays,
					v.leadTimeSource,
					v.priorityScore,
					v.unitsSold,
					v.ratePerWeek,
					v.onHand,
					v.committed,
					v.projectedExpiringUnits,
					v.usable,
					v.daysOfCover,
					v.stockoutOn,
					v.reorderPoint,
					v.orderUpTo,
					v.shelfLifeCap,
					money(v.unitPrice),
					money(v.unitCost),
					money(v.unitMargin),
					v.reasons.join(" "),
				]),
			),
		);
	});
