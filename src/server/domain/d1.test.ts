import { expect, test } from "bun:test";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { orders } from "#/db/schema";
import { withinLocalDays } from "./d1";

const dialect = new SQLiteSyncDialect();
const render = (range: { from?: string; to?: string }) => {
	const filter = withinLocalDays(
		orders.createdAt,
		range,
		"America/El_Salvador",
	);
	if (!filter) throw new Error("no filter");
	return dialect.sqlToQuery(filter);
};

test("both ends are included: from the start of the first local day to the start of the day after the last", () => {
	const q = render({ from: "2026-10-05", to: "2026-10-05" });
	expect(q.sql).toBe(
		'("orders"."created_at" >= ? and "orders"."created_at" < ?)',
	);
	expect(q.params).toEqual(["2026-10-05T06:00:00Z", "2026-10-06T06:00:00Z"]);
});

test("either end can be left open", () => {
	expect(render({ from: "2026-10-05" }).params).toEqual([
		"2026-10-05T06:00:00Z",
	]);
	expect(render({ to: "2026-10-05" }).params).toEqual(["2026-10-06T06:00:00Z"]);
});

test("no days, no filter", () => {
	expect(
		withinLocalDays(orders.createdAt, {}, "America/El_Salvador"),
	).toBeUndefined();
});
