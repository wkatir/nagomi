import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { count, like } from "drizzle-orm";
import { d1, migratedDatabase } from "#/db/test-database";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { getDb, schema } = await import("#/db");
const { pageWindow, sortBy, toPaged } = await import("./list-query");

const { brands } = schema;
const columns = { name: brands.name, slug: brands.slug };

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	for (const [slug, name] of [
		["a", "Beta"],
		["b", "Alfa"],
		["c", "Beta"],
		["d", "Delta"],
		["e", "Alfa"],
		["f", "Gamma"],
		["g", "Beta"],
	])
		db.exec(
			`insert into brands (slug, name, search_key) values ('${slug}', '${name}', '${name.toLowerCase()}')`,
		);
	env.DB = d1(db);
});

async function list(query: {
	page: number;
	pageSize: number;
	sort: "name" | "slug";
	dir: "asc" | "desc";
	q?: string;
}) {
	const database = getDb();
	const where = query.q ? like(brands.name, `%${query.q}%`) : undefined;
	const [rows, [total]] = await database.batch([
		database
			.select({ id: brands.id, name: brands.name })
			.from(brands)
			.where(where)
			.orderBy(...sortBy(columns, query.sort, query.dir, brands.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		database.select({ total: count() }).from(brands).where(where),
	]);
	return toPaged(rows, total.total, query);
}

describe("a paged list", () => {
	test("answers the page, the total and the page count", async () => {
		const page = await list({ page: 1, pageSize: 3, sort: "name", dir: "asc" });
		expect(page.items).toHaveLength(3);
		expect(page).toMatchObject({
			total: 7,
			page: 1,
			pageSize: 3,
			pageCount: 3,
		});
	});

	test("pages follow each other without repeating or skipping a row, with equal names", async () => {
		const seen: number[] = [];
		for (const page of [1, 2, 3]) {
			const result = await list({
				page,
				pageSize: 3,
				sort: "name",
				dir: "asc",
			});
			seen.push(...result.items.map((i) => i.id));
		}
		expect(seen).toHaveLength(7);
		expect(new Set(seen).size).toBe(7);
	});

	test("equal values keep the id order of the direction asked", async () => {
		const asc = await list({ page: 1, pageSize: 10, sort: "name", dir: "asc" });
		expect(asc.items.map((i) => i.name)).toEqual([
			"Alfa",
			"Alfa",
			"Beta",
			"Beta",
			"Beta",
			"Delta",
			"Gamma",
		]);
		const alfaAsc = asc.items.filter((i) => i.name === "Alfa").map((i) => i.id);
		expect(alfaAsc).toEqual([...alfaAsc].sort((a, b) => a - b));
		const desc = await list({
			page: 1,
			pageSize: 10,
			sort: "name",
			dir: "desc",
		});
		const betaDesc = desc.items
			.filter((i) => i.name === "Beta")
			.map((i) => i.id);
		expect(betaDesc).toEqual([...betaDesc].sort((a, b) => b - a));
	});

	test("the total counts what matches the filter, not the page", async () => {
		const page = await list({
			page: 1,
			pageSize: 2,
			sort: "name",
			dir: "asc",
			q: "eta",
		});
		expect(page.total).toBe(3);
		expect(page.items).toHaveLength(2);
		expect(page.pageCount).toBe(2);
	});

	test("a page past the end is empty and keeps the real total", async () => {
		const page = await list({ page: 9, pageSize: 3, sort: "name", dir: "asc" });
		expect(page.items).toEqual([]);
		expect(page).toMatchObject({ total: 7, page: 9, pageCount: 3 });
	});

	test("an empty list still has one page", async () => {
		const page = await list({
			page: 1,
			pageSize: 25,
			sort: "name",
			dir: "asc",
			q: "zzz",
		});
		expect(page).toMatchObject({ items: [], total: 0, pageCount: 1 });
	});
});

describe("pageWindow", () => {
	test("offsets by whole pages", () => {
		expect(pageWindow({ page: 1, pageSize: 25 })).toEqual({
			limit: 25,
			offset: 0,
		});
		expect(pageWindow({ page: 4, pageSize: 10 })).toEqual({
			limit: 10,
			offset: 30,
		});
	});
});
