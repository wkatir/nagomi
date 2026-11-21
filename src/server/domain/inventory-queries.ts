import {
	and,
	count,
	eq,
	or,
	type SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { addDays, daysBetween } from "#/lib/dates";
import type { Locale } from "#/lib/enums";
import type { LotListSearch, StockListSearch } from "#/lib/schemas/inventory";
import { formatExpiry } from "./expiry";
import { isExpired } from "./fefo";
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

type Clock = { today: string; expiryWarningDays: number; locale: Locale };

const lastDayToWarn = (clock: Clock) =>
	addDays(clock.today, clock.expiryWarningDays);

function stockPerSize(db: Db, clock: Clock) {
	const quantity = inventoryMovements.quantity;
	const inLots = (condition: SQL, per: SQL | typeof quantity) =>
		sql<number>`coalesce(sum(case when ${condition} then ${per} else 0 end), 0)`;
	const sellable = sql`${lots.expiresOn} >= ${clock.today}`;
	const expiring = sql`${lots.expiresOn} >= ${clock.today} and ${lots.expiresOn} <= ${lastDayToWarn(clock)}`;
	const expired = sql`${lots.expiresOn} < ${clock.today}`;
	const value = sql`${quantity} * ${lots.unitCostE4}`;
	return db
		.select({
			variantId: lots.variantId,
			units: sql<number>`coalesce(sum(${quantity}), 0)`.as("units"),
			onHand: inLots(sellable, quantity).as("on_hand"),
			onHandValueE4: inLots(sellable, value).as("on_hand_value_e4"),
			expiringUnits: inLots(expiring, quantity).as("expiring_units"),
			expiringValueE4: inLots(expiring, value).as("expiring_value_e4"),
			expiredUnits: inLots(expired, quantity).as("expired_units"),
			expiredValueE4: inLots(expired, value).as("expired_value_e4"),
		})
		.from(lots)
		.innerJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
		.groupBy(lots.variantId)
		.as("stock");
}

type Stock = ReturnType<typeof stockPerSize>;

// A size with no lot has no row in the stock.
const orZero = (column: SQLWrapper) => sql<number>`coalesce(${column}, 0)`;

function stockWhere(stock: Stock, query: StockListSearch) {
	const onHand = orZero(stock.onHand);
	const views = {
		low: sql`${variants.reorderPoint} is not null and ${onHand} <= ${variants.reorderPoint}`,
		out: sql`${onHand} = 0`,
		expiring: sql`${orZero(stock.expiringUnits)} > 0`,
		expired: sql`${orZero(stock.expiredUnits)} > 0`,
	};
	return and(
		or(eq(variants.status, "active"), sql`${orZero(stock.units)} <> 0`),
		query.view ? views[query.view] : undefined,
		query.q ? sizeSearch(query.q) : undefined,
	);
}

const productLabel = sql`(${brands.name} || ' ' || coalesce(${productTranslations.name}, '')) collate nocase`;

const sizeSearch = (q: string) =>
	searchMatch(q, [
		productTranslations.searchKey,
		brands.searchKey,
		variants.searchKey,
	]);

export async function pagedStock(db: Db, clock: Clock, query: StockListSearch) {
	const stock = stockPerSize(db, clock);
	const where = stockWhere(stock, query);
	const sortColumns = {
		product: productLabel,
		sku: variants.sku,
		onHand: orZero(stock.onHand),
		stockValue: orZero(stock.onHandValueE4),
		expiringUnits: orZero(stock.expiringUnits),
		expiredUnits: orZero(stock.expiredUnits),
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
				sizeValue: variants.sizeValue,
				sizeUnit: variants.sizeUnit,
				variantStatus: variants.status,
				reorderPoint: variants.reorderPoint,
				onHand: orZero(stock.onHand).as("sellable_units"),
				onHandValueE4: orZero(stock.onHandValueE4).as("sellable_value_e4"),
				expiringUnits: orZero(stock.expiringUnits).as("expiring_total"),
				expiringValueE4: orZero(stock.expiringValueE4).as("expiring_value"),
				expiredUnits: orZero(stock.expiredUnits).as("expired_total"),
				expiredValueE4: orZero(stock.expiredValueE4).as("expired_value"),
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
	const items = rows.map(
		({
			onHandValueE4,
			expiringValueE4,
			expiredValueE4,
			variantStatus,
			...row
		}) => ({
			...row,
			variantStatus,
			stockValue: e4ToMinor(onHandValueE4),
			expiringValue: e4ToMinor(expiringValueE4),
			expiredValue: e4ToMinor(expiredValueE4),
			belowReorderPoint:
				row.reorderPoint !== null && row.onHand <= row.reorderPoint,
		}),
	);
	return toPaged(items, counted.total, query);
}

export async function stockSummary(db: Db, clock: Clock) {
	const stock = stockPerSize(db, clock);
	const [[sums], [low]] = await db.batch([
		db
			.select({
				units: sql<number>`coalesce(sum(${stock.onHand}), 0)`,
				valueE4: sql<number>`coalesce(sum(${stock.onHandValueE4}), 0)`,
				expiringUnits: sql<number>`coalesce(sum(${stock.expiringUnits}), 0)`,
				expiringValueE4: sql<number>`coalesce(sum(${stock.expiringValueE4}), 0)`,
				expiredUnits: sql<number>`coalesce(sum(${stock.expiredUnits}), 0)`,
				expiredValueE4: sql<number>`coalesce(sum(${stock.expiredValueE4}), 0)`,
			})
			.from(stock),
		db
			.select({ total: count() })
			.from(variants)
			.leftJoin(stock, eq(stock.variantId, variants.id))
			.where(
				and(
					eq(variants.status, "active"),
					sql`${variants.reorderPoint} is not null and ${orZero(stock.onHand)} <= ${variants.reorderPoint}`,
				),
			),
	]);
	if (!sums || !low) throw new Error("The stock summary came back empty");
	return {
		units: sums.units,
		value: e4ToMinor(sums.valueE4),
		expiringUnits: sums.expiringUnits,
		expiringValue: e4ToMinor(sums.expiringValueE4),
		expiredUnits: sums.expiredUnits,
		expiredValue: e4ToMinor(sums.expiredValueE4),
		belowReorderPoint: low.total,
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

export async function pagedLots(db: Db, clock: Clock, query: LotListSearch) {
	const balance = lotBalance(db);
	const where = and(
		sql`${balance.available} > 0`,
		query.view === "expiring"
			? sql`${lots.expiresOn} >= ${clock.today} and ${lots.expiresOn} <= ${lastDayToWarn(clock)}`
			: undefined,
		query.view === "expired"
			? sql`${lots.expiresOn} < ${clock.today}`
			: undefined,
		query.q ? or(sizeSearch(query.q), codeMatch(query.q)) : undefined,
	);
	const sortColumns = {
		expiresOn: lots.expiresOn,
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
				expiresOn: lots.expiresOn,
				expiryPrecision: lots.expiryPrecision,
				unitCostE4: lots.unitCostE4,
				variantId: sql<number>`${variants.id}`.as("variant_id"),
				sku: variants.sku,
				brand: sql<string>`${brands.name}`.as("brand_name"),
				name: sql<string | null>`${productTranslations.name}`.as(
					"product_name",
				),
				sizeValue: variants.sizeValue,
				sizeUnit: variants.sizeUnit,
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
	const items = rows.map(({ unitCostE4, expiryPrecision, ...lot }) => {
		const daysLeft = daysBetween(clock.today, lot.expiresOn);
		return {
			...lot,
			expiry: formatExpiry(lot.expiresOn, expiryPrecision),
			unitCost: e4ToMinor(unitCostE4),
			value: e4ToMinor(lot.available * unitCostE4),
			daysLeft,
			expired: isExpired(lot.expiresOn, clock.today),
			expiringSoon: daysLeft <= clock.expiryWarningDays,
		};
	});
	return toPaged(items, counted.total, query);
}
