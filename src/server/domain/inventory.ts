import { and, asc, eq, gte, ne, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { inList, qualified } from "./d1";
import { sellableUnits } from "./stock";

const { inventoryMovements, lots, orderItems, orders } = schema;

// `holdStart`: the first instant a pending order still holds its units (pendingHoldStart in
// stock.ts).
export type StockClock = { today: string; holdStart: string };

// stockFits spells the same rule in SQL.
export const holdsStock = (holdStart: string) =>
	or(
		eq(orders.status, "confirmed"),
		and(eq(orders.status, "pending"), gte(orders.createdAt, holdStart)),
	);

export function onHandByVariant(db: Db, variantIds?: number[]) {
	return db
		.select({
			variantId: lots.variantId,
			onHand: sql<number>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
		})
		.from(lots)
		.innerJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
		.where(variantIds ? inList(lots.variantId, variantIds) : undefined)
		.groupBy(lots.variantId);
}

// `excludeOrderId`: the order being edited or confirmed.
export function committedByVariant(
	db: Db,
	holdStart: string,
	variantIds?: number[],
	excludeOrderId?: number,
) {
	return db
		.select({
			variantId: orderItems.variantId,
			committed: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orders.id, orderItems.orderId))
		.where(
			and(
				holdsStock(holdStart),
				variantIds ? inList(orderItems.variantId, variantIds) : undefined,
				excludeOrderId === undefined
					? undefined
					: ne(orders.id, excludeOrderId),
			),
		)
		.groupBy(orderItems.variantId);
}

// Read before a write to say how many are left; the write itself is guarded by stockFits.
export async function sellableByVariant(
	db: Db,
	clock: StockClock,
	variantIds: number[],
	excludeOrderId?: number,
) {
	const [stock, promised] = await Promise.all([
		onHandByVariant(db, variantIds),
		committedByVariant(db, clock.holdStart, variantIds, excludeOrderId),
	]);
	const onHand = new Map(stock.map((r) => [r.variantId, r.onHand]));
	const committed = new Map(promised.map((r) => [r.variantId, r.committed]));
	return new Map(
		variantIds.map((id) => [
			id,
			sellableUnits(onHand.get(id) ?? 0, committed.get(id) ?? 0),
		]),
	);
}

export async function linesBeyondStock<
	L extends { variantId: number; quantity: number },
>(db: Db, clock: StockClock, lines: L[], excludeOrderId?: number) {
	const sellable = await sellableByVariant(
		db,
		clock,
		lines.map((l) => l.variantId),
		excludeOrderId,
	);
	return lines.flatMap((l) => {
		const available = sellable.get(l.variantId);
		if (available === undefined)
			throw new Error(`No sellable figure for variant ${l.variantId}`);
		return l.quantity > available ? [{ ...l, available }] : [];
	});
}

// Inside the D1 batch that writes an order it sees every order written before it (a D1
// database runs one query at a time and a batch is one transaction), so two orders can never
// both take the last unit. The lines travel as one JSON parameter, under D1's bound
// parameter limit.
export function stockFits(
	lines: { variantId: number; quantity: number }[],
	clock: StockClock,
	excludeOrderId: number | null = null,
) {
	const items = JSON.stringify(lines.map((l) => [l.variantId, l.quantity]));
	return sql`not exists (select 1 from json_each(${items}) j where json_extract(j.value, '$[1]') > (select coalesce(sum(m.quantity), 0) from lots l join inventory_movements m on m.lot_id = l.id where l.variant_id = json_extract(j.value, '$[0]')) - (select coalesce(sum(oi.quantity), 0) from order_items oi join orders o on o.id = oi.order_id where oi.variant_id = json_extract(j.value, '$[0]') and o.id is not ${excludeOrderId} and (o.status = 'confirmed' or (o.status = 'pending' and o.created_at >= ${clock.holdStart}))))`;
}

export function lotStock(db: Db, where?: SQL) {
	return db
		.select({
			lotId: lots.id,
			variantId: lots.variantId,
			code: lots.code,
			unitCostE4: lots.unitCostE4,
			available: sql<number>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
		})
		.from(lots)
		.leftJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
		.where(where)
		.groupBy(lots.id)
		.orderBy(asc(lots.id));
}

export async function stockByVariant(db: Db) {
	const rows = await db
		.select({
			variantId: lots.variantId,
			onHand: sql<number>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
		})
		.from(lots)
		.leftJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
		.groupBy(lots.variantId);
	return new Map(rows.map(({ variantId, ...units }) => [variantId, units]));
}

// Cost basis of the catalogue and the reorder report: the latest lot received at a price;
// free units (cost 0) are left out.
export async function latestLandedCostE4(db: Db) {
	const rows = await db
		.select({ variantId: lots.variantId, unitCostE4: lots.unitCostE4 })
		.from(lots)
		.where(
			sql`${lots.id} = (select max(l2.id) from lots l2 where l2.variant_id = ${qualified(lots.variantId)} and l2.unit_cost_e4 > 0)`,
		);
	return new Map(rows.map((r) => [r.variantId, r.unitCostE4]));
}
