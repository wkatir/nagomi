import {
	and,
	asc,
	count,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNotNull,
	lt,
	sql,
} from "drizzle-orm";
import { integer, sqliteView, text } from "drizzle-orm/sqlite-core";
import { type Db, schema } from "#/db";
import { CUSTOMER_SEGMENTS, type CustomerSegment } from "#/lib/enums";
import type {
	CustomerListSearch,
	MarketingChannel,
} from "#/lib/schemas/customers";
import { inList, qualified } from "./d1";
import { groupBy } from "./group-by";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { orderLines } from "./order-queries";
import { keptValue, owedOf, paidSum } from "./order-sql";
import { COMMITTED_STATUSES } from "./order-state";
import { pageOf } from "./paging";
import { amountOwed, paymentSummary } from "./payments";
import { searchMatch } from "./search-sql";

const {
	customerAddresses,
	customerConsents,
	customers,
	orders,
	pages,
	pageVersions,
	productReviews,
} = schema;

export const customerSegments = sqliteView("customer_segments", {
	customerId: integer("customer_id").notNull(),
	orderCount: integer("order_count").notNull(),
	lastOrderAt: text("last_order_at"),
	segment: text("segment", { enum: CUSTOMER_SEGMENTS }),
}).existing();

const optedIn = (channel: MarketingChannel) =>
	and(
		channel === "email"
			? isNotNull(customers.email)
			: isNotNull(customers.phoneE164),
		sql`(select c2.granted from customer_consents c2 where c2.customer_id = ${qualified(customers.id)} and c2.purpose = ${`marketing_${channel}`} order by c2.id desc limit 1) = 1`,
	);

type ListFilters = {
	q?: string;
	segment?: CustomerSegment;
	marketing?: MarketingChannel;
};

const listWhere = ({ q, segment, marketing }: ListFilters) =>
	and(
		q ? searchMatch(q, [customers.searchKey]) : undefined,
		segment ? eq(customerSegments.segment, segment) : undefined,
		marketing ? optedIn(marketing) : undefined,
	);

const customerColumns = {
	...getTableColumns(customers),
	segment: customerSegments.segment,
};

type Totals = {
	orders: number;
	lifetimeValue: number;
	netPaid: number;
	// Negative: the store owes the customer.
	balance: number;
	firstOrderAt: string;
	lastOrderAt: string;
};

type CustomerTotals = Omit<Totals, "firstOrderAt" | "lastOrderAt"> & {
	firstOrderAt: string | null;
	lastOrderAt: string | null;
};

const noOrders: CustomerTotals = {
	orders: 0,
	lifetimeValue: 0,
	netPaid: 0,
	balance: 0,
	firstOrderAt: null,
	lastOrderAt: null,
};

const totalsOf = (
	totals: Map<number, Totals>,
	customerId: number,
): CustomerTotals => totals.get(customerId) ?? noOrders;

// Lifetime value: what booked orders owe, net of returns.
async function lifetimeTotals(db: Db, customerIds: number[]) {
	if (customerIds.length === 0) return new Map<number, Totals>();
	const booked = await db
		.select({
			id: orders.id,
			customerId: orders.customerId,
			status: orders.status,
			subtotal: orders.subtotal,
			discount: orders.discount,
			shipping: orders.shipping,
			createdAt: orders.createdAt,
			paid: paidSum("payment"),
			refunded: paidSum("refund"),
		})
		.from(orders)
		.where(
			and(
				inList(orders.customerId, customerIds),
				inArray(orders.status, [...COMMITTED_STATUSES]),
			),
		);
	const lines =
		booked.length === 0
			? []
			: await orderLines(
					db,
					booked.map((o) => o.id),
				);
	const linesOf = groupBy(lines, (l) => l.orderId);
	const out = new Map<number, Totals>();
	for (const o of booked) {
		if (o.customerId === null) throw new Error(`Order ${o.id} has no customer`);
		const lines = linesOf.get(o.id);
		if (lines === undefined) throw new Error(`Order ${o.id} has no lines`);
		const owed = amountOwed({ ...o, lines });
		const t = out.get(o.customerId) ?? {
			orders: 0,
			lifetimeValue: 0,
			netPaid: 0,
			balance: 0,
			firstOrderAt: o.createdAt,
			lastOrderAt: o.createdAt,
		};
		t.orders += 1;
		t.lifetimeValue += owed;
		t.netPaid += o.paid - o.refunded;
		t.balance += owed - (o.paid - o.refunded);
		if (o.createdAt < t.firstOrderAt) t.firstOrderAt = o.createdAt;
		if (o.createdAt > t.lastOrderAt) t.lastOrderAt = o.createdAt;
		out.set(o.customerId, t);
	}
	return out;
}

async function currentConsents(db: Db, customerIds: number[]) {
	if (customerIds.length === 0) return [];
	return db
		.select({
			customerId: customerConsents.customerId,
			purpose: customerConsents.purpose,
			granted: customerConsents.granted,
			recordedAt: customerConsents.recordedAt,
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
		.where(
			and(
				inList(customerConsents.customerId, customerIds),
				sql`${customerConsents.id} = (select max(c2.id) from customer_consents c2 where c2.customer_id = ${customerConsents.customerId} and c2.purpose = ${customerConsents.purpose})`,
			),
		)
		.orderBy(asc(customerConsents.customerId), asc(customerConsents.purpose));
}

type CustomerRow = typeof customers.$inferSelect & {
	segment: CustomerSegment | null;
};

const profileOf = ({ searchKey: _, authUserId, ...r }: CustomerRow) => ({
	...r,
	hasAccount: authUserId !== null,
});

async function withTotals(db: Db, rows: CustomerRow[]) {
	const totals = await lifetimeTotals(
		db,
		rows.map((r) => r.id),
	);
	return rows.map((r) => ({
		...profileOf(r),
		...totalsOf(totals, r.id),
	}));
}

// lifetimeTotals in SQL, for the sorts; customers-list.test.ts checks both agree.
const soldList = sql.raw(
	COMMITTED_STATUSES.map((status) => `'${status}'`).join(", "),
);
const bookedOf = sql`o.customer_id = ${qualified(customers.id)} and o.status in (${soldList})`;

const sortColumns = {
	// The search key starts with the name without accents or capitals.
	name: customers.searchKey,
	orders: sql<number>`(select count(*) from orders o where ${bookedOf})`,
	spent: sql<number>`(select coalesce(sum(${owedOf("s")}), 0) from (select o.status, o.subtotal, o.discount, o.shipping, ${keptValue(sql.raw("o.id"))} as kept from orders o where ${bookedOf}) s)`,
	lastOrder: sql<
		string | null
	>`(select max(o.created_at) from orders o where ${bookedOf})`,
	createdAt: customers.createdAt,
};

export async function pagedCustomers(db: Db, query: CustomerListSearch) {
	const where = listWhere(query);
	const { limit, offset } = pageWindow(query);
	const [rows, [counted]] = await db.batch([
		db
			.select(customerColumns)
			.from(customers)
			.innerJoin(
				customerSegments,
				eq(customerSegments.customerId, customers.id),
			)
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, customers.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: count() })
			.from(customers)
			.innerJoin(
				customerSegments,
				eq(customerSegments.customerId, customers.id),
			)
			.where(where),
	]);
	return toPaged(await withTotals(db, rows), counted.total, query);
}

export async function listCustomers(
	db: Db,
	filters: ListFilters,
	cursor: number | null,
	limit: number,
) {
	const rows = await db
		.select(customerColumns)
		.from(customers)
		.innerJoin(customerSegments, eq(customerSegments.customerId, customers.id))
		.where(
			and(
				listWhere(filters),
				cursor === null ? undefined : lt(customers.id, cursor),
			),
		)
		.orderBy(desc(customers.id))
		.limit(limit + 1);
	const { page, nextCursor } = pageOf(rows, limit);
	const [withTotal, consents] = await Promise.all([
		withTotals(db, page),
		currentConsents(
			db,
			page.map((r) => r.id),
		),
	]);
	const consentsOf = groupBy(consents, (x) => x.customerId);
	return {
		customers: withTotal.map((customer) => ({
			...customer,
			consents: (consentsOf.get(customer.id) ?? []).map(
				({ customerId: _, ...x }) => x,
			),
		})),
		nextCursor,
	};
}

export async function customerDetail(db: Db, id: number) {
	const [customer] = await db
		.select({
			...customerColumns,
			purchaseCount: customerSegments.orderCount,
			lastPurchaseAt: customerSegments.lastOrderAt,
		})
		.from(customers)
		.innerJoin(customerSegments, eq(customerSegments.customerId, customers.id))
		.where(eq(customers.id, id));
	if (!customer) return null;
	const [totals, current, history, orderRows, addresses, reviews] =
		await Promise.all([
			lifetimeTotals(db, [id]),
			currentConsents(db, [id]),
			db
				.select({
					id: customerConsents.id,
					orderId: customerConsents.orderId,
					purpose: customerConsents.purpose,
					granted: customerConsents.granted,
					channel: customerConsents.channel,
					recordedAt: customerConsents.recordedAt,
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
				.where(eq(customerConsents.customerId, id))
				.orderBy(desc(customerConsents.id)),
			db
				.select({
					id: orders.id,
					code: orders.code,
					channel: orders.channel,
					status: orders.status,
					subtotal: orders.subtotal,
					discount: orders.discount,
					shipping: orders.shipping,
					total: orders.total,
					createdAt: orders.createdAt,
					paidAt: orders.paidAt,
					shippedAt: orders.shippedAt,
					deliveredAt: orders.deliveredAt,
					cancelledAt: orders.cancelledAt,
					paid: paidSum("payment"),
					refunded: paidSum("refund"),
				})
				.from(orders)
				.where(eq(orders.customerId, id))
				.orderBy(desc(orders.createdAt), desc(orders.id)),
			db
				.select({
					id: customerAddresses.id,
					recipientName: customerAddresses.recipientName,
					department: customerAddresses.department,
					municipality: customerAddresses.municipality,
					addressLine: customerAddresses.addressLine,
					reference: customerAddresses.reference,
					phoneE164: customerAddresses.phoneE164,
					isDefault: customerAddresses.isDefault,
					status: customerAddresses.status,
				})
				.from(customerAddresses)
				.where(eq(customerAddresses.customerId, id))
				.orderBy(desc(customerAddresses.isDefault), asc(customerAddresses.id)),
			db
				.select({
					id: productReviews.id,
					productId: productReviews.productId,
					productName: sql<
						string | null
					>`(select pt.name from product_translations pt where pt.product_id = ${qualified(productReviews.productId)} and pt.locale = (select s.default_locale from store_settings s where s.id = 1))`,
					rating: productReviews.rating,
					title: productReviews.title,
					status: productReviews.status,
					createdAt: productReviews.createdAt,
				})
				.from(productReviews)
				.where(eq(productReviews.customerId, id))
				.orderBy(desc(productReviews.createdAt), desc(productReviews.id)),
		]);
	const lines =
		orderRows.length === 0
			? []
			: await orderLines(
					db,
					orderRows.map((o) => o.id),
				);
	const linesOf = groupBy(lines, (l) => l.orderId);
	return {
		customer: profileOf(customer),
		addresses,
		reviews,
		totals: totalsOf(totals, id),
		consents: current.map(({ customerId: _, ...x }) => x),
		consentHistory: history,
		orders: orderRows.map(({ paid, refunded, ...o }) => {
			const items = linesOf.get(o.id);
			if (items === undefined) throw new Error(`Order ${o.id} has no lines`);
			return {
				...o,
				units: items.reduce((n, l) => n + l.quantity - l.returned, 0),
				payment: paymentSummary(
					amountOwed({ ...o, lines: items }),
					paid,
					refunded,
				),
			};
		}),
	};
}
