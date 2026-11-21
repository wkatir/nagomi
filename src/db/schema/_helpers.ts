import { type SQL, sql } from "drizzle-orm";
import {
	check,
	integer,
	type SQLiteColumn,
	text,
} from "drizzle-orm/sqlite-core";
import { LOCALES } from "#/lib/enums";

export const id = () => integer("id").primaryKey({ autoIncrement: true });
export const now = sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;
export const createdAt = () => text("created_at").notNull().default(now);
export const updatedAt = () => text("updated_at").notNull().default(now);
export const locale = (name = "locale") =>
	text(name, { enum: LOCALES }).notNull();
// No foreign key: Better Auth owns the users table.
export const actor = (name: string) => text(name);

const quoted = (values: readonly string[]) =>
	sql.raw(values.map((v) => `'${v}'`).join(", "));
// NULL passes: add notNull for a required column.
export const oneOf = (
	name: string,
	column: SQLiteColumn,
	values: readonly string[],
) => check(name, sql`${column} in (${quoted(values)})`);
export const isDate = (column: SQLiteColumn): SQL =>
	sql`${column} glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`;

export const slugCheck = (name: string, column: SQLiteColumn) =>
	check(
		name,
		sql`${column} not glob '*[^a-z0-9-]*' and ${column} not glob '-*' and ${column} not glob '*-' and ${column} not glob '*--*' and length(${column}) between 1 and 80`,
	);
export const seoText = () => ({
	seoTitle: text("seo_title"),
	seoDescription: text("seo_description"),
});
