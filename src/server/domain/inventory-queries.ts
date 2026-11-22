import { and, count, eq, or, type SQLWrapper, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/lib/enums";
import type { LotListSearch, StockListSearch } from "#/lib/schemas/inventory";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { e4ToMinor } from "./receiving";
import { searchPatterns } from "./search";
import { searchMatch } from "./search-sql";

const {
	brands,
	inventoryMovements,
	lots,
	productTranslations,
	products,
	purchaseOrderItems,
	purchaseOrders,
	purchaseReceiptLines,
	variants,
} = schema;

export type StockClock = { locale: Locale; lowStockThreshold: number };

function stockPerVariant(db: Db) {
	const quantity = inventoryMovements.quantity;
	return db
		.select({
			variantId: lots.variantId,
			units: sql<number>`coalesce(sum(${quantity}), 0)`.as("units"),
			onHand: sql<number>`coalesce(sum(${quantity}), 0)`.as("on_hand"),
			onHandValueE4:
				sql<number>`coalesce(sum(${quantity} * ${lots.unitCostE4}), 0)`.as(
					"on_hand_value_e4",
				),
		})
		.from(lots)
		.innerJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
		.groupBy(lots.variantId)
		.as("stock");
}

type Stock = ReturnType<typeof stockPerVariant>;

const orZero = (column: SQLWrapper) => sql<number>`coalesce(${column}, 0)`;

const lowPoint = (clock: StockClock) =>
	sql<number>`coalesce(${variants.reorderPoint}, ${clock.lowStockThreshold})`;

export const isLowStock = (
	onHand: number,
	reorderPoint: number | null,
	lowStockThreshold: number,
) => onHand <= (reorderPoint ?? lowStockThreshold);

function stockWhere(stock: Stock, clock: StockClock, query: StockListSearch) {
	const onHand = orZero(stock.onHand);
	const views = {
		low: sql`${onHand} <= ${lowPoint(clock)}`,
		out: sql`${onHand} = 0`,
	};
	return and(
		or(eq(variants.status, "active"), sql`${orZero(stock.units)} <> 0`),
		query.view ? views[query.view] : undefined,
		query.q ? variantSearch(query.q) : undefined,
	);
}

const productLabel = sql`(${brands.name} || ' ' || coalesce(${productTranslations.name}, '')) collate nocase`;

const variantSearch = (q: string) =>
	searchMatch(q, [
		productTranslations.searchKey,
		brands.searchKey,
		variants.searchKey,
	]);

export async function pagedStock(
	db: Db,
	clock: StockClock,
	query: StockListSearch,
) {
	const stock = stockPerVariant(db);
	const where = stockWhere(stock, clock, query);
	const sortColumns = {
		product: productLabel,
		sku: variants.sku,
		onHand: orZero(stock.onHand),
		stockValue: orZero(stock.onHandValueE4),
		reorderPoint: variants.reorderPoint,
	};
	const [rows, [counted]] = await db.batch([
		db
			.select({
				variantId: variants.id,
				sku: variants.sku,
				brand: sql<string>`${brands.name}`.as("brand_name"),
				name: sql<string | null>`${productTranslations.name}`.as(
					"product_name",
				),
				optionLabel: variants.optionLabel,
				variantStatus: variants.status,
				reorderPoint: variants.reorderPoint,
				onHand: orZero(stock.onHand).as("sellable_units"),
				onHandValueE4: orZero(stock.onHandValueE4).as("sellable_value_e4"),
			})
			.from(variants)
			.innerJoin(products, eq(products.id, variants.productId))
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, products.id),
					eq(productTranslations.locale, clock.locale),
				),
			)
			.leftJoin(stock, eq(stock.variantId, variants.id))
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, variants.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(variants)
			.innerJoin(products, eq(products.id, variants.productId))
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, products.id),
					eq(productTranslations.locale, clock.locale),
				),
			)
			.leftJoin(stock, eq(stock.variantId, variants.id))
			.where(where),
	]);
	const items = rows.map(({ onHandValueE4, variantStatus, ...row }) => ({
		...row,
		variantStatus,
		stockValue: e4ToMinor(onHandValueE4),
		lowStock: isLowStock(row.onHand, row.reorderPoint, clock.lowStockThreshold),
	}));
	return toPaged(items, counted.total, query);
}

export async function stockSummary(db: Db, clock: StockClock) {
	const stock = stockPerVariant(db);
	const [[sums], [low]] = await db.batch([
		db
			.select({
				units: sql<number>`coalesce(sum(${stock.onHand}), 0)`,
				valueE4: sql<number>`coalesce(sum(${stock.onHandValueE4}), 0)`,
			})
			.from(stock),
		db
			.select({ total: count() })
			.from(variants)
			.leftJoin(stock, eq(stock.variantId, variants.id))
			.where(
				and(
					eq(variants.status, "active"),
					sql`${orZero(stock.onHand)} <= ${lowPoint(clock)}`,
				),
			),
	]);
	if (!sums || !low) throw new Error("The stock summary came back empty");
	return {
		units: sums.units,
		value: e4ToMinor(sums.valueE4),
		lowStock: low.total,
	};
}

const lotBalance = (db: Db) =>
	db
		.select({
			lotId: inventoryMovements.lotId,
			available: sql<number>`sum(${inventoryMovements.quantity})`.as(
				"available",
			),
			received:
				sql<number>`sum(case when ${inventoryMovements.kind} = 'receive' then ${inventoryMovements.quantity} else 0 end)`.as(
					"received",
				),
		})
		.from(inventoryMovements)
		.groupBy(inventoryMovements.lotId)
		.as("balance");

const codeMatch = (q: string) =>
	or(
		...searchPatterns(q).map(
			(pattern) => sql`lower(${lots.code}) like ${pattern} escape '\\'`,
		),
	);

export async function pagedLots(
	db: Db,
	clock: StockClock,
	query: LotListSearch,
) {
	const balance = lotBalance(db);
	const where = and(
		sql`${balance.available} > 0`,
		query.q ? or(variantSearch(query.q), codeMatch(query.q)) : undefined,
	);
	const sortColumns = {
		receivedAt: lots.id,
		product: productLabel,
		sku: variants.sku,
		code: sql`${lots.code} collate nocase`,
		available: balance.available,
		unitCost: lots.unitCostE4,
		value: sql`${balance.available} * ${lots.unitCostE4}`,
	};
	const [rows, [counted]] = await db.batch([
		db
			.select({
				// Columns of a batch are read by name: the three ids need a name of their own.
				lotId: sql<number>`${lots.id}`.as("lot_id"),
				code: lots.code,
				receivedAt: lots.createdAt,
				unitCostE4: lots.unitCostE4,
				variantId: sql<number>`${variants.id}`.as("variant_id"),
				sku: variants.sku,
				brand: sql<string>`${brands.name}`.as("brand_name"),
				name: sql<string | null>`${productTranslations.name}`.as(
					"product_name",
				),
				optionLabel: variants.optionLabel,
				available: balance.available,
				received: balance.received,
				purchaseOrderId: sql<number>`${purchaseOrders.id}`.as(
					"purchase_order_id",
				),
				reference: purchaseOrders.reference,
			})
			.from(lots)
			.innerJoin(balance, eq(balance.lotId, lots.id))
			.innerJoin(variants, eq(variants.id, lots.variantId))
			.innerJoin(products, eq(products.id, variants.productId))
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, products.id),
					eq(productTranslations.locale, clock.locale),
				),
			)
			.innerJoin(
				purchaseReceiptLines,
				eq(purchaseReceiptLines.id, lots.receiptLineId),
			)
			.innerJoin(
				purchaseOrderItems,
				eq(purchaseOrderItems.id, purchaseReceiptLines.purchaseOrderItemId),
			)
			.innerJoin(
				purchaseOrders,
				eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
			)
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, lots.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(lots)
			.innerJoin(balance, eq(balance.lotId, lots.id))
			.innerJoin(variants, eq(variants.id, lots.variantId))
			.innerJoin(products, eq(products.id, variants.productId))
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, products.id),
					eq(productTranslations.locale, clock.locale),
				),
			)
			.where(where),
	]);
	const items = rows.map(({ unitCostE4, ...lot }) => ({
		...lot,
		unitCost: e4ToMinor(unitCostE4),
		value: e4ToMinor(lot.available * unitCostE4),
	}));
	return toPaged(items, counted.total, query);
}
