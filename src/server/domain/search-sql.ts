import { or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { searchPatterns } from "./search";

// Undefined (no condition) for a term that normalizes to nothing.
export function searchMatch(term: string, keys: SQLWrapper[]): SQL | undefined {
	return or(
		...searchPatterns(term).flatMap((pattern) =>
			keys.map((key) => sql`${key} like ${pattern} escape '\\'`),
		),
	);
}

const ACCENTS = [
	["á", "a"],
	["é", "e"],
	["í", "i"],
	["ó", "o"],
	["ú", "u"],
	["ü", "u"],
	["ñ", "n"],
] as const;

// For text that has no search key column of its own (names and titles in a language), in a
// search or in an ORDER BY, so "Ángel" sorts with the A's. SQLite lowers ASCII only, so the
// capitals with accents are replaced too; the pairs are constants, not bound values.
export const foldedText = (column: SQLWrapper) =>
	sql`lower(${ACCENTS.flatMap(([accented, plain]) => [
		[accented, plain],
		[accented.toUpperCase(), plain],
	]).reduce<SQL>(
		(text, [accented, plain]) =>
			sql`replace(${text}, ${sql.raw(`'${accented}'`)}, ${sql.raw(`'${plain}'`)})`,
		sql`${column}`,
	)})`;
