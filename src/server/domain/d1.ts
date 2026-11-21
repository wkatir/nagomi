import {
	and,
	getTableColumns,
	getTableName,
	gte,
	is,
	lt,
	SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import type {
	SQLiteColumn,
	SQLiteInsertValue,
	SQLiteTable,
} from "drizzle-orm/sqlite-core";
import type { Db } from "#/db";
import { addDays, startOfLocalDay } from "#/lib/dates";

// Inside a D1 batch (one transaction, statements run in order) this re-checks at write time
// a state read before the batch. drizzle embeds the `guard` select already parenthesised.
export function insertIfExists<T extends SQLiteTable>(
	db: Db,
	table: T,
	row: SQLiteInsertValue<T>,
	guard: SQLWrapper,
) {
	const values = Object.entries(getTableColumns(table)).map(([key, column]) => {
		const value = (row as Record<string, unknown>)[key];
		if (value !== undefined)
			return is(value, SQL) ? value : sql.param(value, column);
		if (column.default === undefined) return sql`null`;
		return is(column.default, SQL)
			? column.default
			: sql.param(column.default, column);
	});
	return db
		.insert(table)
		.select(sql`select ${sql.join(values, sql`, `)} where exists ${guard}`);
}

// `column IN (ids)` bound as one JSON parameter: D1 rejects a query with more than 100
// bound parameters, so id lists that can grow must not become one parameter per id.
export const inList = (column: SQLWrapper, ids: readonly (number | string)[]) =>
	sql`${column} in (select value from json_each(${JSON.stringify(ids)}))`;

// D1 batches need at least one statement.
export function nonEmpty<T>(statements: T[]): [T, ...T[]] {
	const [first, ...rest] = statements;
	if (first === undefined)
		throw new Error("A batch needs at least one statement");
	return [first, ...rest];
}

// drizzle writes a bare "column" when the outer query has a single table, which inside a
// correlated subquery would name the inner table's column of the same name.
export const qualified = (column: SQLiteColumn) =>
	sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;

// For an audit row written just before the insert in the same batch. Exact for tables whose
// rows are never deleted (AUTOINCREMENT never reuses an id).
export const nextId = (table: SQLiteTable) =>
	sql<number>`(select coalesce(max(id), 0) + 1 from ${table})`;

export const withinLocalDays = (
	column: SQLiteColumn,
	range: { from?: string; to?: string },
	timeZone: string,
) =>
	and(
		range.from ? gte(column, startOfLocalDay(range.from, timeZone)) : undefined,
		range.to
			? lt(column, startOfLocalDay(addDays(range.to, 1), timeZone))
			: undefined,
	);
