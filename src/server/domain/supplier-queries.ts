import { and, asc, count, eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { ArchivableStatus } from "#/lib/enums";
import type { SupplierListSearch } from "#/lib/schemas/suppliers";
import { qualified } from "./d1";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { searchMatch } from "./search-sql";

const { suppliers } = schema;

const openPurchaseOrders = sql<number>`(select count(*) from purchase_orders po where po.supplier_id = ${qualified(suppliers.id)} and po.status in ('draft', 'ordered', 'partially_received'))`;

export const supplierColumns = {
	id: suppliers.id,
	name: suppliers.name,
	contactName: suppliers.contactName,
	phoneE164: suppliers.phoneE164,
	email: suppliers.email,
	paymentTerms: suppliers.paymentTerms,
	leadTimeDays: suppliers.leadTimeDays,
	notes: suppliers.notes,
	status: suppliers.status,
	createdAt: suppliers.createdAt,
	updatedAt: suppliers.updatedAt,
	openPurchaseOrders: openPurchaseOrders.as("open_purchase_orders"),
};

const sortColumns = {
	// Names sort ignoring case: "acme" sits among the A's, not after the Z's.
	name: sql`${suppliers.name} collate nocase`,
	leadTimeDays: suppliers.leadTimeDays,
	openPurchaseOrders,
	createdAt: suppliers.createdAt,
};

const filterWhere = (query: SupplierListSearch): SQL | undefined =>
	and(
		query.status ? eq(suppliers.status, query.status) : undefined,
		query.q ? searchMatch(query.q, [suppliers.searchKey]) : undefined,
	);

export async function pagedSuppliers(db: Db, query: SupplierListSearch) {
	const where = filterWhere(query);
	const [rows, [counted]] = await db.batch([
		db
			.select(supplierColumns)
			.from(suppliers)
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, suppliers.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db.select({ total: count() }).from(suppliers).where(where),
	]);
	return toPaged(rows, counted.total, query);
}

export const supplierOptions = (db: Db, status?: ArchivableStatus) =>
	db
		.select({
			id: suppliers.id,
			name: suppliers.name,
			leadTimeDays: suppliers.leadTimeDays,
			status: suppliers.status,
		})
		.from(suppliers)
		.where(status ? eq(suppliers.status, status) : undefined)
		.orderBy(asc(sql`${suppliers.name} collate nocase`), asc(suppliers.id));
