import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { addDays, localDate, startOfLocalDay } from "#/lib/dates";
import { qualified } from "./d1";
import { groupBy } from "./group-by";
import { committedByVariant, latestLandedCostE4, lotStock } from "./inventory";
import { returnedOfLine } from "./order-sql";
import { SHIPPED_STATUSES, SOLD_STATUSES } from "./order-state";
import { amountOwed } from "./payments";
import type { LossMovement, ReturnedLine } from "./reports";
import { type OrderSale, orderSale, type SoldOrder } from "./sales";

// Every report, the dashboard and the CSV exports read their facts here, so a figure means
// the same everywhere. Ranges are whole local days.

const {
	brands,
	inventoryMovements,
	lots,
	orderItems,
	orders,
	payments,
	productTranslations,
	products,
	purchaseReceiptLines,
	purchaseReceipts,
	returnLines,
	returns,
	supplierItems,
	suppliers,
	variants,
} = schema;

type LocalRange = { from: string; to: string; timeZone: string };

const utcBounds = ({ from, to, timeZone }: LocalRange) => ({
	start: startOfLocalDay(from, timeZone),
	end: startOfLocalDay(addDays(to, 1), timeZone),
});

const between = (column: Parameters<typeof gte>[0], range: LocalRange) => {
	const { start, end } = utcBounds(range);
	return and(gte(column, start), lt(column, end));
};

const soldCostOfLine = sql<number>`(select coalesce(-sum(m.quantity * l.unit_cost_e4), 0) from inventory_movements m join lots l on l.id = m.lot_id where m.kind = 'sale' and m.order_item_id = ${qualified(orderItems.id)})`;
const returnedCostOfLine = sql<number>`(select coalesce(sum(m.quantity * l.unit_cost_e4), 0) from inventory_movements m join lots l on l.id = m.lot_id join return_lines rl on rl.id = m.return_line_id where m.kind = 'return' and rl.order_item_id = ${qualified(orderItems.id)})`;

// A confirmed or later order always has lines (trigger orders_require_lines). Heads and
// lines are read in one batch: two separate reads would miss the lines of an order that
// reached the status between them.
function linesOf<T>(byOrder: Map<number, T[]>, orderId: number): T[] {
	const lines = byOrder.get(orderId);
	if (lines === undefined) throw new Error(`Order ${orderId} has no lines`);
	return lines;
}

// Net of every return of their units, whenever it was recorded.
export async function loadSales(
	db: Db,
	range: LocalRange,
): Promise<OrderSale[]> {
	const sold = and(
		inArray(orders.status, [...SHIPPED_STATUSES]),
		between(orders.fulfilledAt, range),
	);
	const [heads, lines] = await db.batch([
		db
			.select({
				id: orders.id,
				status: orders.status,
				subtotal: orders.subtotal,
				discount: orders.discount,
				shipping: orders.shipping,
				fulfilledAt: orders.fulfilledAt,
			})
			.from(orders)
			.where(sold)
			.orderBy(asc(orders.fulfilledAt), asc(orders.id)),
		db
			.select({
				orderId: orderItems.orderId,
				orderItemId: orderItems.id,
				variantId: orderItems.variantId,
				sku: orderItems.sku,
				brand: orderItems.brandName,
				name: orderItems.productName,
				quantity: orderItems.quantity,
				unitPrice: orderItems.unitPrice,
				returned: returnedOfLine,
				soldCostE4: soldCostOfLine,
				returnedCostE4: returnedCostOfLine,
			})
			.from(orderItems)
			.where(
				inArray(
					orderItems.orderId,
					db.select({ id: orders.id }).from(orders).where(sold),
				),
			)
			.orderBy(asc(orderItems.id)),
	]);
	const byOrder = groupBy(lines, (l) => l.orderId);
	return heads.map((o): OrderSale => {
		if (o.fulfilledAt === null)
			throw new Error(`Order ${o.id} is ${o.status} without fulfilled_at`);
		const order: SoldOrder = {
			...o,
			day: localDate(new Date(o.fulfilledAt), range.timeZone),
			lines: linesOf(byOrder, o.id),
		};
		return orderSale(order);
	});
}

// Valued at what the orders owe now, net of returns.
export async function loadBookings(db: Db, range: LocalRange) {
	const booked = and(
		inArray(orders.status, [...SOLD_STATUSES]),
		between(orders.confirmedAt, range),
	);
	const [heads, lines] = await db.batch([
		db
			.select({
				id: orders.id,
				status: orders.status,
				subtotal: orders.subtotal,
				discount: orders.discount,
				shipping: orders.shipping,
			})
			.from(orders)
			.where(booked),
		db
			.select({
				orderId: orderItems.orderId,
				quantity: orderItems.quantity,
				unitPrice: orderItems.unitPrice,
				returned: returnedOfLine,
			})
			.from(orderItems)
			.where(
				inArray(
					orderItems.orderId,
					db.select({ id: orders.id }).from(orders).where(booked),
				),
			),
	]);
	const byOrder = groupBy(lines, (l) => l.orderId);
	return {
		orders: heads.length,
		value: heads.reduce(
			(n, o) => n + amountOwed({ ...o, lines: linesOf(byOrder, o.id) }),
			0,
		),
	};
}

export function loadLossMovements(
	db: Db,
	range: LocalRange,
): Promise<LossMovement[]> {
	return db
		.select({
			kind: sql<LossMovement["kind"]>`${inventoryMovements.kind}`,
			reason: inventoryMovements.reason,
			quantity: inventoryMovements.quantity,
			unitCostE4: lots.unitCostE4,
		})
		.from(inventoryMovements)
		.innerJoin(lots, eq(lots.id, inventoryMovements.lotId))
		.where(
			and(
				inArray(inventoryMovements.kind, ["waste", "adjustment"]),
				between(inventoryMovements.createdAt, range),
			),
		);
}

export function loadReturnedLines(
	db: Db,
	range: LocalRange,
): Promise<ReturnedLine[]> {
	return db
		.select({
			returnId: returns.id,
			reason: returns.reason,
			disposition: returnLines.disposition,
			quantity: returnLines.quantity,
			unitPrice: orderItems.unitPrice,
			unitCostE4: lots.unitCostE4,
		})
		.from(returnLines)
		.innerJoin(returns, eq(returns.id, returnLines.returnId))
		.innerJoin(orderItems, eq(orderItems.id, returnLines.orderItemId))
		.innerJoin(lots, eq(lots.id, returnLines.lotId))
		.where(between(returns.createdAt, range));
}

export async function loadRefunds(db: Db, range: LocalRange) {
	const [row] = await db
		.select({
			count: sql<number>`count(*)`,
			amount: sql<number>`coalesce(sum(${payments.amount}), 0)`,
		})
		.from(payments)
		.where(
			and(
				eq(payments.kind, "refund"),
				eq(payments.status, "confirmed"),
				between(payments.recordedAt, range),
			),
		);
	if (!row) throw new Error("Aggregate returned no row");
	return row;
}

export const loadLotBalances = (db: Db) => lotStock(db);

export async function loadVariants(db: Db, locale: string) {
	const rows = await db
		.select({
			variantId: variants.id,
			sku: variants.sku,
			variantStatus: variants.status,
			productId: products.id,
			productStatus: products.status,
			brand: brands.name,
			name: productTranslations.name,
			price: variants.price,
			reorderPoint: variants.reorderPoint,
		})
		.from(variants)
		.innerJoin(products, eq(products.id, variants.productId))
		.innerJoin(brands, eq(brands.id, products.brandId))
		.leftJoin(
			productTranslations,
			and(
				eq(productTranslations.productId, products.id),
				sql`${productTranslations.locale} = ${locale}`,
			),
		)
		.orderBy(asc(brands.name), asc(variants.sku));
	return rows.map((r) => ({ ...r, name: r.name ?? r.sku }));
}

type VariantSupplier = {
	supplierId: number;
	supplier: string;
	supplierItemId: number;
	supplierSku: string | null;
	leadTimeDays: number | null;
	packSize: number | null;
	minOrderQuantity: number | null;
	source: "preferred" | "only_supplier";
};

export async function loadReplenishment(db: Db, holdStart: string) {
	const [received, latest, committed, sources] = await Promise.all([
		db
			.select({
				variantId: lots.variantId,
				firstReceivedOn: sql<string>`min(${purchaseReceipts.receivedOn})`,
			})
			.from(lots)
			.innerJoin(
				purchaseReceiptLines,
				eq(purchaseReceiptLines.id, lots.receiptLineId),
			)
			.innerJoin(
				purchaseReceipts,
				eq(purchaseReceipts.id, purchaseReceiptLines.receiptId),
			)
			.groupBy(lots.variantId),
		latestLandedCostE4(db),
		committedByVariant(db, holdStart),
		db
			.select({
				variantId: supplierItems.variantId,
				supplierId: suppliers.id,
				supplier: suppliers.name,
				supplierItemId: supplierItems.id,
				supplierSku: supplierItems.supplierSku,
				leadTimeDays: suppliers.leadTimeDays,
				packSize: supplierItems.packSize,
				minOrderQuantity: supplierItems.minOrderQuantity,
				isPreferred: supplierItems.isPreferred,
			})
			.from(supplierItems)
			.innerJoin(suppliers, eq(suppliers.id, supplierItems.supplierId))
			.where(
				and(eq(supplierItems.status, "active"), eq(suppliers.status, "active")),
			),
	]);
	const supplier = new Map<number, VariantSupplier>();
	for (const [variantId, items] of groupBy(sources, (s) => s.variantId)) {
		const preferred = items.find((i) => i.isPreferred);
		const chosen = preferred ?? (items.length === 1 ? items[0] : undefined);
		if (!chosen) continue;
		const { isPreferred: _, variantId: __, ...fields } = chosen;
		supplier.set(variantId, {
			...fields,
			source: preferred ? "preferred" : "only_supplier",
		});
	}
	return {
		firstReceivedOn: new Map(
			received.map((r) => [r.variantId, r.firstReceivedOn]),
		),
		latestUnitCostE4: latest,
		committed: new Map(committed.map((r) => [r.variantId, r.committed])),
		supplier,
	};
}
