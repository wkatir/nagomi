import { and, asc, count, desc, eq, or, type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { OrderStatus, ReturnDisposition, ReturnReason } from "#/db/schema";
import type { OrderListSearch, orderFilters } from "#/lib/schemas/orders";
import { inList, qualified, withinLocalDays } from "./d1";
import { groupBy } from "./group-by";
import { pageWindow, sortBy, toPaged } from "./list-query";
import {
	paidSum,
	paymentStatusIs,
	promotionCodeOfOrder,
	returnedOfLine,
} from "./order-sql";
import { amountOwed, paymentSummary } from "./payments";
import { e4ToMinor } from "./receiving";
import { searchMatch } from "./search-sql";

const {
	auditEvents,
	customerConsents,
	customers,
	inventoryMovements,
	lots,
	orderItems,
	orders,
	pages,
	pageVersions,
	payments,
	returnLines,
	returns,
	users,
} = schema;

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)_(\d+)$/;

type OrderFilters = z.infer<typeof orderFilters>;

const customerName = orders.customerName;

function filterWhere(filters: OrderFilters, timeZone: string) {
	const conditions: (SQL | undefined)[] = [];
	if (filters.status) conditions.push(eq(orders.status, filters.status));
	if (filters.channel) conditions.push(eq(orders.channel, filters.channel));
	if (filters.customerId)
		conditions.push(eq(orders.customerId, filters.customerId));
	if (filters.paymentStatus)
		conditions.push(paymentStatusIs(filters.paymentStatus));
	conditions.push(withinLocalDays(orders.createdAt, filters, timeZone));
	if (filters.q)
		conditions.push(
			searchMatch(filters.q, [orders.searchKey, customers.searchKey]),
		);
	return conditions;
}

const listColumns = {
	id: orders.id,
	code: orders.code,
	locale: orders.locale,
	channel: orders.channel,
	status: orders.status,
	paymentMethod: orders.paymentMethod,
	subtotal: orders.subtotal,
	discount: orders.discount,
	discountReason: orders.discountReason,
	shipping: orders.shipping,
	total: orders.total,
	shippingMethod: orders.shippingMethod,
	shippingZoneName: orders.shippingZoneName,
	shipDepartment: orders.shipDepartment,
	shipMunicipality: orders.shipMunicipality,
	shipAddressLine: orders.shipAddressLine,
	shipReference: orders.shipReference,
	courier: orders.courier,
	trackingCode: orders.trackingCode,
	taxIncluded: orders.taxIncluded,
	cancelledBy: orders.cancelledBy,
	deliveryEstimateFrom: orders.deliveryEstimateFrom,
	deliveryEstimateTo: orders.deliveryEstimateTo,
	confirmationMessage: orders.confirmationMessage,
	cancelReason: orders.cancelReason,
	notes: orders.notes,
	createdAt: orders.createdAt,
	paidAt: orders.paidAt,
	shippedAt: orders.shippedAt,
	deliveredAt: orders.deliveredAt,
	cancelledAt: orders.cancelledAt,
	customerId: orders.customerId,
	customerName,
	customerEmail: orders.customerEmail,
	customerPhone: orders.customerPhone,
	promotionId: orders.promotionId,
	promotionCode: promotionCodeOfOrder,
	paid: paidSum("payment"),
	refunded: paidSum("refund"),
};

export function orderLines(db: Db, orderIds: number[]) {
	return db
		.select({
			id: orderItems.id,
			orderId: orderItems.orderId,
			variantId: orderItems.variantId,
			sku: orderItems.sku,
			brandName: orderItems.brandName,
			name: orderItems.productName,
			optionLabel: orderItems.optionLabel,
			quantity: orderItems.quantity,
			unitPrice: orderItems.unitPrice,
			returned: returnedOfLine,
			bundleName: sql<
				string | null
			>`(select ob.name from order_bundles ob where ob.id = ${qualified(orderItems.orderBundleId)})`,
		})
		.from(orderItems)
		.where(inList(orderItems.orderId, orderIds))
		.orderBy(asc(orderItems.id));
}

type OrderLine = Awaited<ReturnType<typeof orderLines>>[number];

function withPayment<
	R extends {
		id: number;
		status: OrderStatus;
		subtotal: number;
		discount: number;
		shipping: number;
		paid: number;
		refunded: number;
	},
>(rows: R[], lines: Map<number, OrderLine[]>) {
	return rows.map(({ paid, refunded, ...r }) => {
		// Every order has at least one line (API and trigger orders_require_lines).
		const own = lines.get(r.id);
		if (own === undefined) throw new Error(`Order ${r.id} has no lines`);
		return {
			...r,
			payment: paymentSummary(amountOwed({ ...r, lines: own }), paid, refunded),
			items: own,
		};
	});
}

export async function listOrders(
	db: Db,
	timeZone: string,
	filters: OrderFilters,
	cursor: string | null,
	limit: number,
) {
	let keyset: SQL | undefined;
	if (cursor !== null) {
		// Dropping a bad cursor would restart at page 1 and loop a paged export.
		const match = CURSOR.exec(cursor);
		if (match === null) throw new Error(`Invalid cursor ${cursor}`);
		keyset = sql`(${orders.createdAt} < ${match[1]} or (${orders.createdAt} = ${match[1]} and ${orders.id} < ${Number(match[2])}))`;
	}
	// One row more than needed tells whether another page exists.
	const rows = await db
		.select(listColumns)
		.from(orders)
		.leftJoin(customers, eq(customers.id, orders.customerId))
		.where(and(...filterWhere(filters, timeZone), keyset))
		.orderBy(desc(orders.createdAt), desc(orders.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const last = page[page.length - 1];
	const lines =
		page.length === 0
			? []
			: await orderLines(
					db,
					page.map((r) => r.id),
				);
	return {
		orders: withPayment(
			page,
			groupBy(lines, (l) => l.orderId),
		),
		nextCursor: rows.length > limit ? `${last.createdAt}_${last.id}` : null,
	};
}

const sortColumns = {
	createdAt: orders.createdAt,
	code: orders.code,
	customer: customerName,
	total: orders.total,
	status: orders.status,
};

export async function pagedOrders(
	db: Db,
	timeZone: string,
	query: OrderListSearch,
) {
	const where = and(...filterWhere(query, timeZone));
	const [rows, [counted]] = await db.batch([
		db
			.select({
				id: orders.id,
				code: orders.code,
				channel: orders.channel,
				status: orders.status,
				paymentMethod: orders.paymentMethod,
				subtotal: orders.subtotal,
				discount: orders.discount,
				shipping: orders.shipping,
				total: orders.total,
				createdAt: orders.createdAt,
				customerName: orders.customerName,
				customerEmail: orders.customerEmail,
				customerPhone: orders.customerPhone,
				paid: listColumns.paid.as("paid"),
				refunded: listColumns.refunded.as("refunded"),
			})
			.from(orders)
			.leftJoin(customers, eq(customers.id, orders.customerId))
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, orders.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(orders)
			.leftJoin(customers, eq(customers.id, orders.customerId))
			.where(where),
	]);
	const lines =
		rows.length === 0
			? []
			: await orderLines(
					db,
					rows.map((r) => r.id),
				);
	const items = withPayment(
		rows,
		groupBy(lines, (l) => l.orderId),
	).map(
		({ subtotal: _s, discount: _d, shipping: _f, items: _i, ...row }) => row,
	);
	return toPaged(items, counted.total, query);
}

export async function orderDetail(db: Db, id: number) {
	const [head] = await db
		.select({
			...listColumns,
			customerNotes: customers.notes,
			shippingZoneId: orders.shippingZoneId,
			idempotencyKey: orders.idempotencyKey,
		})
		.from(orders)
		.leftJoin(customers, eq(customers.id, orders.customerId))
		.where(eq(orders.id, id));
	if (!head) return null;
	// Two indexed lookups: sales of its lines, and the returns and write-offs of its return
	// lines.
	const ofOrder = sql`${inventoryMovements.id} in (select m.id from inventory_movements m where m.order_item_id in (select oi.id from order_items oi where oi.order_id = ${id}) union select m.id from inventory_movements m where m.return_line_id in (select rl.id from return_lines rl join returns r on r.id = rl.return_id where r.order_id = ${id}))`;
	const [lines, money, returnRows, movements, consents, trail] =
		await Promise.all([
			orderLines(db, [id]),
			db
				.select({
					id: payments.id,
					kind: payments.kind,
					method: payments.method,
					amount: payments.amount,
					status: payments.status,
					reference: payments.reference,
					providerTransactionId: payments.providerTransactionId,
					returnId: payments.returnId,
					recordedAt: payments.recordedAt,
					recordedBy: payments.recordedBy,
					recordedByName: users.name,
				})
				.from(payments)
				.leftJoin(users, eq(users.id, payments.recordedBy))
				.where(eq(payments.orderId, id))
				.orderBy(asc(payments.id)),
			db
				.select({
					id: returns.id,
					reason: returns.reason,
					note: returns.note,
					createdAt: returns.createdAt,
					createdBy: returns.createdBy,
					lineId: returnLines.id,
					orderItemId: returnLines.orderItemId,
					lotId: returnLines.lotId,
					lotCode: lots.code,
					quantity: returnLines.quantity,
					disposition: returnLines.disposition,
				})
				.from(returns)
				.innerJoin(returnLines, eq(returnLines.returnId, returns.id))
				.innerJoin(lots, eq(lots.id, returnLines.lotId))
				.where(eq(returns.orderId, id))
				.orderBy(asc(returns.id), asc(returnLines.id)),
			db
				.select({
					id: inventoryMovements.id,
					lotId: inventoryMovements.lotId,
					lotCode: lots.code,
					unitCostE4: lots.unitCostE4,
					kind: inventoryMovements.kind,
					quantity: inventoryMovements.quantity,
					orderItemId: inventoryMovements.orderItemId,
					returnLineId: inventoryMovements.returnLineId,
					reason: inventoryMovements.reason,
					note: inventoryMovements.note,
					createdAt: inventoryMovements.createdAt,
					createdBy: inventoryMovements.createdBy,
				})
				.from(inventoryMovements)
				.innerJoin(lots, eq(lots.id, inventoryMovements.lotId))
				.where(ofOrder)
				.orderBy(asc(inventoryMovements.id)),
			db
				.select({
					id: customerConsents.id,
					purpose: customerConsents.purpose,
					granted: customerConsents.granted,
					channel: customerConsents.channel,
					recordedAt: customerConsents.recordedAt,
					pageVersionId: customerConsents.pageVersionId,
					page: pages.slug,
					locale: pageVersions.locale,
					version: pageVersions.version,
				})
				.from(customerConsents)
				.innerJoin(
					pageVersions,
					eq(pageVersions.id, customerConsents.pageVersionId),
				)
				.innerJoin(pages, eq(pages.id, pageVersions.pageId))
				.where(eq(customerConsents.orderId, id))
				.orderBy(asc(customerConsents.id)),
			db
				.select({
					id: auditEvents.id,
					action: auditEvents.action,
					data: auditEvents.data,
					createdAt: auditEvents.createdAt,
					actorUserId: auditEvents.actorUserId,
					actorName: users.name,
					actorEmail: users.email,
				})
				.from(auditEvents)
				.leftJoin(users, eq(users.id, auditEvents.actorUserId))
				// The order's own events and those of its payments and returns.
				.where(
					or(
						and(
							eq(auditEvents.entityType, "order"),
							eq(auditEvents.entityId, String(id)),
						),
						sql`json_extract(data, '$.orderId') = ${id}`,
					),
				)
				.orderBy(asc(auditEvents.id)),
		]);
	const { paid, refunded, ...order } = head;
	const owed = amountOwed({ ...order, lines });
	const cost = movements.reduce(
		(n, m) => {
			const value = m.quantity * m.unitCostE4;
			if (m.kind === "sale") n.soldE4 -= value;
			else if (m.kind === "return") n.returnedE4 += value;
			else if (m.kind === "waste") n.writtenOffE4 -= value;
			return n;
		},
		{ soldE4: 0, returnedE4: 0, writtenOffE4: 0 },
	);
	return {
		order,
		payment: paymentSummary(owed, paid, refunded),
		lines: lines.map(({ orderId: _, ...l }) => ({
			...l,
			lots: lotsOfLine(movements, l.id),
		})),
		payments: money.filter((p) => p.kind === "payment"),
		refunds: money.filter((p) => p.kind === "refund"),
		returns: groupReturns(returnRows),
		movements: movements.map(({ unitCostE4, ...m }) => ({
			...m,
			unitCost: e4ToMinor(unitCostE4),
		})),
		consents,
		audit: trail,
		cost: {
			sold: e4ToMinor(cost.soldE4),
			returned: e4ToMinor(cost.returnedE4),
			writtenOff: e4ToMinor(cost.writtenOffE4),
			costOfGoodsSold: e4ToMinor(cost.soldE4 - cost.returnedE4),
		},
	};
}

type DetailMovement = {
	lotId: number;
	lotCode: string | null;
	kind: string;
	quantity: number;
	orderItemId: number | null;
};

function lotsOfLine(movements: DetailMovement[], orderItemId: number) {
	const byLot = new Map<
		number,
		{ lotId: number; code: string | null; units: number }
	>();
	for (const m of movements) {
		if (m.kind !== "sale" || m.orderItemId !== orderItemId) continue;
		const row = byLot.get(m.lotId) ?? {
			lotId: m.lotId,
			code: m.lotCode,
			units: 0,
		};
		row.units += -m.quantity;
		byLot.set(m.lotId, row);
	}
	return [...byLot.values()];
}

type ReturnRow = {
	id: number;
	reason: ReturnReason;
	note: string | null;
	createdAt: string;
	createdBy: string;
	lineId: number;
	orderItemId: number;
	lotId: number;
	lotCode: string | null;
	quantity: number;
	disposition: ReturnDisposition;
};

function groupReturns(rows: ReturnRow[]) {
	const out: (Omit<
		ReturnRow,
		"lineId" | "orderItemId" | "lotId" | "lotCode" | "quantity" | "disposition"
	> & {
		lines: Pick<
			ReturnRow,
			"orderItemId" | "lotId" | "lotCode" | "quantity" | "disposition"
		>[];
	})[] = [];
	for (const r of rows) {
		let ret = out.at(-1);
		if (ret?.id !== r.id) {
			ret = {
				id: r.id,
				reason: r.reason,
				note: r.note,
				createdAt: r.createdAt,
				createdBy: r.createdBy,
				lines: [],
			};
			out.push(ret);
		}
		ret.lines.push({
			orderItemId: r.orderItemId,
			lotId: r.lotId,
			lotCode: r.lotCode,
			quantity: r.quantity,
			disposition: r.disposition,
		});
	}
	return out;
}
