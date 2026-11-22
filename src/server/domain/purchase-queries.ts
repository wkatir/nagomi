import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/lib/enums";
import type { PurchaseListSearch } from "#/lib/schemas/purchasing";
import { qualified, withinLocalDays } from "./d1";
import { groupBy } from "./group-by";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { productTextIn } from "./product-text";
import { e4ToMinor } from "./receiving";
import { searchPatterns } from "./search";
import { searchMatch } from "./search-sql";

const {
	brands,
	lots,
	productTranslations,
	products,
	purchaseOrderItems,
	purchaseOrders,
	purchaseReceiptLines,
	purchaseReceipts,
	suppliers,
	users,
	variants,
} = schema;

const OPEN_STATUSES = ["draft", "ordered", "partially_received"] as const;

const orderedUnits = sql<number>`(select coalesce(sum(i.quantity), 0) from purchase_order_items i where i.purchase_order_id = ${qualified(purchaseOrders.id)})`;
const receivedUnits = sql<number>`(select coalesce(sum(l.quantity), 0) from purchase_receipt_lines l join purchase_order_items i on i.id = l.purchase_order_item_id where i.purchase_order_id = ${qualified(purchaseOrders.id)})`;
const orderTotal = sql<number>`(select coalesce(sum(i.quantity * i.unit_cost), 0) from purchase_order_items i where i.purchase_order_id = ${qualified(purchaseOrders.id)})`;
const supplierName = sql<string>`${suppliers.name}`;

const rowColumns = {
	id: purchaseOrders.id,
	reference: purchaseOrders.reference,
	status: purchaseOrders.status,
	supplierId: purchaseOrders.supplierId,
	supplier: supplierName.as("supplier_name"),
	orderedOn: purchaseOrders.orderedOn,
	createdAt: purchaseOrders.createdAt,
	units: orderedUnits.as("units"),
	receivedUnits: receivedUnits.as("received_units"),
	total: orderTotal.as("total"),
};

const sortColumns = {
	createdAt: purchaseOrders.createdAt,
	reference: sql`${purchaseOrders.reference} collate nocase`,
	supplier: sql`${suppliers.name} collate nocase`,
	status: purchaseOrders.status,
	total: orderTotal,
	orderedOn: purchaseOrders.orderedOn,
};

const referenceMatch = (q: string) =>
	or(
		...searchPatterns(q).map(
			(pattern) =>
				sql`lower(${purchaseOrders.reference}) like ${pattern} escape '\\'`,
		),
	);

function filterWhere(query: PurchaseListSearch, timeZone: string) {
	return and(
		query.status ? eq(purchaseOrders.status, query.status) : undefined,
		query.supplierId
			? eq(purchaseOrders.supplierId, query.supplierId)
			: undefined,
		withinLocalDays(purchaseOrders.createdAt, query, timeZone),
		query.q
			? or(referenceMatch(query.q), searchMatch(query.q, [suppliers.searchKey]))
			: undefined,
	);
}

export async function pagedPurchases(
	db: Db,
	timeZone: string,
	query: PurchaseListSearch,
) {
	const where = filterWhere(query, timeZone);
	const [rows, [counted]] = await db.batch([
		db
			.select(rowColumns)
			.from(purchaseOrders)
			.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, purchaseOrders.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(purchaseOrders)
			.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
			.where(where),
	]);
	return toPaged(rows, counted.total, query);
}

export const openPurchasesOf = (db: Db, supplierId: number) =>
	db
		.select(rowColumns)
		.from(purchaseOrders)
		.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
		.where(
			and(
				eq(purchaseOrders.supplierId, supplierId),
				inArray(purchaseOrders.status, OPEN_STATUSES),
			),
		)
		.orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id));

export async function purchaseDetail(db: Db, locale: Locale, id: number) {
	const [head] = await db
		.select({
			...rowColumns,
			taxIncluded: purchaseOrders.taxIncluded,
			notes: purchaseOrders.notes,
			cancelledAt: purchaseOrders.cancelledAt,
			createdBy: purchaseOrders.createdBy,
			createdByName: users.name,
			supplierStatus: suppliers.status,
			supplierLeadTimeDays: suppliers.leadTimeDays,
		})
		.from(purchaseOrders)
		.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
		.leftJoin(users, eq(users.id, purchaseOrders.createdBy))
		.where(eq(purchaseOrders.id, id));
	if (!head) return null;
	const [items, receipts, receiptLines] = await Promise.all([
		db
			.select({
				id: purchaseOrderItems.id,
				variantId: purchaseOrderItems.variantId,
				sku: variants.sku,
				brand: brands.name,
				name: productTranslations.name,
				optionLabel: variants.optionLabel,
				quantity: purchaseOrderItems.quantity,
				received: sql<number>`(select coalesce(sum(l.quantity), 0) from purchase_receipt_lines l where l.purchase_order_item_id = ${qualified(purchaseOrderItems.id)})`,
				unitCost: purchaseOrderItems.unitCost,
			})
			.from(purchaseOrderItems)
			.innerJoin(variants, eq(variants.id, purchaseOrderItems.variantId))
			.innerJoin(products, eq(products.id, variants.productId))
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(productTranslations, productTextIn(locale))
			.where(eq(purchaseOrderItems.purchaseOrderId, id))
			.orderBy(asc(purchaseOrderItems.id)),
		db
			.select({
				id: purchaseReceipts.id,
				receivedOn: purchaseReceipts.receivedOn,
				supplierInvoiceRef: purchaseReceipts.supplierInvoiceRef,
				shippingCost: purchaseReceipts.shippingCost,
				notes: purchaseReceipts.notes,
				createdAt: purchaseReceipts.createdAt,
				createdByName: users.name,
			})
			.from(purchaseReceipts)
			.leftJoin(users, eq(users.id, purchaseReceipts.createdBy))
			.where(eq(purchaseReceipts.purchaseOrderId, id))
			.orderBy(asc(purchaseReceipts.id)),
		db
			.select({
				id: purchaseReceiptLines.id,
				receiptId: purchaseReceiptLines.receiptId,
				purchaseOrderItemId: purchaseReceiptLines.purchaseOrderItemId,
				quantity: purchaseReceiptLines.quantity,
				lotId: lots.id,
				lotCode: lots.code,
				unitCostE4: lots.unitCostE4,
			})
			.from(purchaseReceiptLines)
			.innerJoin(
				purchaseReceipts,
				eq(purchaseReceipts.id, purchaseReceiptLines.receiptId),
			)
			.innerJoin(lots, eq(lots.receiptLineId, purchaseReceiptLines.id))
			.where(eq(purchaseReceipts.purchaseOrderId, id))
			.orderBy(asc(purchaseReceiptLines.id)),
	]);
	const linesOf = groupBy(receiptLines, (l) => l.receiptId);
	return {
		...head,
		items,
		receipts: receipts.map((r) => {
			// A receipt is written with its lots in one batch: it never has none.
			const own = linesOf.get(r.id);
			if (own === undefined) throw new Error(`Receipt ${r.id} has no lines`);
			return {
				...r,
				lines: own.map(({ receiptId: _, unitCostE4, ...l }) => ({
					...l,
					landedUnitCost: e4ToMinor(unitCostE4),
				})),
			};
		}),
	};
}
