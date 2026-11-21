import { Database, type SQLQueryBindings } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every migration in journal order, with foreign keys on as D1 runs them.
const dir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(
	readFileSync(join(dir, "meta/_journal.json"), "utf8"),
) as { entries: { tag: string }[] };
export const migrations = journal.entries.map((e) =>
	readFileSync(join(dir, `${e.tag}.sql`), "utf8"),
);

export function migratedDatabase() {
	const db = new Database(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	for (const file of migrations)
		for (const statement of file.split("--> statement-breakpoint"))
			if (statement.trim()) db.exec(statement);
	return db;
}

// The part of D1 that drizzle-orm/d1 calls, so routers run against the real schema and
// triggers.
export function d1(db: Database) {
	const statement = (sql: string, params: SQLQueryBindings[] = []) => {
		const execute = () => {
			const results = db.prepare(sql).all(...params);
			const { changes } = db.prepare("select changes() as changes").get() as {
				changes: number;
			};
			return { results, meta: { changes }, success: true };
		};
		return {
			execute,
			bind: (...values: SQLQueryBindings[]) => statement(sql, values),
			all: async () => execute(),
			run: async () => execute(),
			raw: async () => db.prepare(sql).values(...params),
		};
	};
	return {
		prepare: (sql: string) => statement(sql),
		// D1 runs a batch as one transaction: a failing statement rolls back the rest.
		batch: async (statements: ReturnType<typeof statement>[]) =>
			db.transaction(() => statements.map((s) => s.execute()))(),
	};
}
