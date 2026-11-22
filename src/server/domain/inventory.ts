import { asc, eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { inList, qualified } from "./d1";
import { sellableUnits } from "./stock";

const { inventoryMovements, lots } = schema;

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

// Read before a write to say how many are left; the lot_balance_negative trigger guards the
// write itself.
export async function sellableByVariant(db: Db, variantIds: number[]) {
	const stock = await onHandByVariant(db, variantIds);
	const onHand = new Map(stock.map((r) => [r.variantId, r.onHand]));
	return new Map(
		variantIds.map((id) => [id, sellableUnits(onHand.get(id) ?? 0)]),
	);
}

export async function linesBeyondStock<
	L extends { variantId: number; quantity: number },
>(db: Db, lines: L[]) {
	const totals = new Map<number, number>();
	for (const l of lines)
		totals.set(l.variantId, (totals.get(l.variantId) ?? 0) + l.quantity);
	const sellable = await sellableByVariant(db, [...totals.keys()]);
	return lines.flatMap((l) => {
		const available = sellable.get(l.variantId);
		if (available === undefined)
			throw new Error(`No sellable figure for variant ${l.variantId}`);
		return (totals.get(l.variantId) ?? 0) > available
			? [{ ...l, available }]
			: [];
	});
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

// The latest lot received at a price; free units (cost 0) are left out.
export async function latestLandedCostE4(db: Db) {
	const rows = await db
		.select({ variantId: lots.variantId, unitCostE4: lots.unitCostE4 })
		.from(lots)
		.where(
			sql`${lots.id} = (select max(l2.id) from lots l2 where l2.variant_id = ${qualified(lots.variantId)} and l2.unit_cost_e4 > 0)`,
		);
	return new Map(rows.map((r) => [r.variantId, r.unitCostE4]));
}
