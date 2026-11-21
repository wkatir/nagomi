import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { type Db, schema } from "#/db";
import type { CustomerListSearch } from "#/lib/schemas/customers";
import { inList, qualified } from "./d1";
import { groupBy } from "./group-by";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { orderLines } from "./order-queries";
import { keptValue, owedOf, paidSum } from "./order-sql";
import { SOLD_STATUSES } from "./order-state";
import { pageOf } from "./paging";
import { amountOwed, paymentSummary } from "./payments";
import { searchMatch } from "./search-sql";

const { customerConsents, customers, orders, pages, pageVersions } = schema;

const searchWhere = (q: string | undefined) =>
	q ? searchMatch(q, [customers.searchKey]) : undefined;

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
				inArray(orders.status, [...SOLD_STATUSES]),
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

type CustomerRow = typeof customers.$inferSelect;

async function withTotals(db: Db, rows: CustomerRow[]) {
	const totals = await lifetimeTotals(
		db,
		rows.map((r) => r.id),
	);
	return rows.map(({ searchKey: _, ...r }) => ({
		...r,
		...totalsOf(totals, r.id),
	}));
}

// lifetimeTotals in SQL, for the sorts; customers-list.test.ts checks both agree.
const soldList = sql.raw(
	SOLD_STATUSES.map((status) => `'${status}'`).join(", "),
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
	const where = searchWhere(query.q);
	const { limit, offset } = pageWindow(query);
	const [rows, [counted]] = await db.batch([
		db
			.select()
			.from(customers)
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, customers.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(customers).where(where),
	]);
	return toPaged(await withTotals(db, rows), counted.total, query);
}

export async function listCustomers(
	db: Db,
	q: string | undefined,
	cursor: number | null,
	limit: number,
) {
	const rows = await db
		.select()
		.from(customers)
		.where(
			and(
				searchWhere(q),
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
	const customer = await db.query.customers.findFirst({
		where: eq(customers.id, id),
	});
	if (!customer) return null;
	const [totals, current, history, orderRows] = await Promise.all([
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
				confirmedAt: orders.confirmedAt,
				fulfilledAt: orders.fulfilledAt,
				deliveredAt: orders.deliveredAt,
				cancelledAt: orders.cancelledAt,
				paid: paidSum("payment"),
				refunded: paidSum("refund"),
			})
			.from(orders)
			.where(eq(orders.customerId, id))
			.orderBy(desc(orders.createdAt), desc(orders.id)),
	]);
	const lines =
		orderRows.length === 0
			? []
			: await orderLines(
					db,
					orderRows.map((o) => o.id),
				);
	const linesOf = groupBy(lines, (l) => l.orderId);
	const { searchKey: _, ...profile } = customer;
	return {
		customer: profile,
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
