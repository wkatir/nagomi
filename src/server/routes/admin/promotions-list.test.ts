import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { apiError } = await import("#/server/api-error");
const { promotionsRouter } = await import("./promotions");

const app = new Hono<AdminEnv>()
	.onError(apiError)
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/promotions", promotionsRouter);

type Row = {
	id: number;
	code: string;
	type: string;
	value: number;
	status: string;
	usage: number;
	termsLocked: boolean;
	translations: { locale: string; description: string }[];
};
type Page = {
	items: Row[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/promotions${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const ids = (page: Page) => page.items.map((p) => p.id);

const send = (method: string, path: string, body: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

let db: Database;

function promotion(p: {
	code: string;
	type?: "percentage" | "fixed";
	value: number;
	status: "active" | "inactive" | "archived";
	minSubtotal?: number;
	startsOn?: string;
	endsOn?: string;
	createdAt: string;
}) {
	db.prepare(
		"insert into promotions (code, type, value, status, min_subtotal, starts_on, ends_on, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
	).run(
		p.code,
		p.type ?? "percentage",
		p.value,
		p.status,
		p.minSubtotal ?? null,
		p.startsOn ?? null,
		p.endsOn ?? null,
		p.createdAt,
	);
}

let nextOrder = 0;
const orderWith = (
	promotionId: number,
	status: "pending" | "confirmed" | "cancelled",
	createdAt: string,
) => {
	const id = ++nextOrder;
	db.exec(
		`insert into orders (id, code, idempotency_key, request_hash, locale, channel, status, subtotal, total, search_key, promotion_id, created_at) values (${id}, 'O-${id}', 'k${id}', 'h', 'es', 'whatsapp', '${status}', 1000, 1000, 'o-${id}', ${promotionId}, '${createdAt}')`,
	);
};

const stored = (id: number) =>
	db.query("select * from promotions where id = ?").get(id) as {
		code: string;
		type: string;
		value: number;
		min_subtotal: number | null;
		starts_on: string | null;
		ends_on: string | null;
		usage_limit: number | null;
		per_customer_limit: number | null;
		status: string;
	};
const texts = (id: number) =>
	db
		.query(
			"select locale, description from promotion_translations where promotion_id = ? order by locale",
		)
		.all(id);

beforeEach(() => {
	nextOrder = 0;
	db = migratedDatabase();
	// These tests are about what the API reads and refuses; the triggers would ask for
	// orders whose discount matches the code, which has nothing to do with it.
	const triggers = db
		.query("select name from sqlite_master where type = 'trigger'")
		.all() as { name: string }[];
	for (const { name } of triggers) db.exec(`drop trigger "${name}"`);
	db.exec(
		"insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es')",
	);
	env.DB = d1(db);
	promotion({
		code: "SPRING10",
		value: 10,
		status: "active",
		startsOn: "2026-03-01",
		endsOn: "2026-03-31",
		createdAt: "2026-01-01T12:00:00Z",
	});
	promotion({
		code: "FIJO5",
		type: "fixed",
		value: 500,
		status: "inactive",
		minSubtotal: 2000,
		createdAt: "2026-02-01T12:00:00Z",
	});
	promotion({
		code: "WELCOME",
		value: 15,
		status: "active",
		startsOn: "2026-02-01",
		endsOn: "2026-12-31",
		createdAt: "2026-03-01T12:00:00Z",
	});
	promotion({
		code: "OLD20",
		value: 20,
		status: "archived",
		createdAt: "2025-12-01T12:00:00Z",
	});
	db.exec(`
insert into promotion_translations (promotion_id, locale, description) values (1, 'es', '10% de primavera'), (1, 'en', '10% off in spring'), (3, 'es', 'Bienvenida');
`);
	// SPRING10: one order that counts and a cancelled one. WELCOME: two. OLD20: only a
	// cancelled one, which still fixes its terms.
	orderWith(1, "confirmed", "2026-03-02T12:00:00Z");
	orderWith(1, "cancelled", "2026-03-03T12:00:00Z");
	orderWith(3, "confirmed", "2026-03-04T12:00:00Z");
	orderWith(3, "pending", "2026-03-05T12:00:00Z");
	orderWith(4, "cancelled", "2026-01-05T12:00:00Z");
});

describe("GET /promotions", () => {
	test("pages the newest first, with the total, the usage and whether the terms are locked", async () => {
		const page = await list();
		expect(ids(page)).toEqual([3, 2, 1, 4]);
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		expect(page.items.map((p) => [p.code, p.usage, p.termsLocked])).toEqual([
			["WELCOME", 2, true],
			["FIJO5", 0, false],
			["SPRING10", 1, true],
			["OLD20", 0, true],
		]);
		const spring = page.items.find((p) => p.code === "SPRING10");
		expect(spring).toMatchObject({
			type: "percentage",
			value: 10,
			status: "active",
			startsOn: "2026-03-01",
			endsOn: "2026-03-31",
		});
		expect(
			spring?.translations.map((t) => [t.locale, t.description]).sort(),
		).toEqual([
			["en", "10% off in spring"],
			["es", "10% de primavera"],
		]);
		expect(page.items.find((p) => p.code === "FIJO5")?.translations).toEqual(
			[],
		);
	});

	test("takes the page size and page the screen asks for, and answers a page past the end empty", async () => {
		for (let n = 5; n <= 16; n++)
			promotion({
				code: `CODE${n}`,
				value: 5,
				status: "inactive",
				createdAt: `2025-11-${String(n).padStart(2, "0")}T12:00:00Z`,
			});
		const first = await list("pageSize=10");
		expect(ids(first)).toEqual([3, 2, 1, 4, 16, 15, 14, 13, 12, 11]);
		expect(first).toMatchObject({ total: 16, pageSize: 10, pageCount: 2 });
		const second = await list("pageSize=10&page=2");
		expect(ids(second)).toEqual([10, 9, 8, 7, 6, 5]);
		const past = await list("pageSize=10&page=9");
		expect(past).toMatchObject({ items: [], total: 16, page: 9, pageCount: 2 });
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			ids(await list(`sort=${sort}&dir=${dir}`));
		expect(await sorted("createdAt", "asc")).toEqual([4, 1, 2, 3]);
		expect(await sorted("createdAt", "desc")).toEqual([3, 2, 1, 4]);
		expect(await sorted("code", "asc")).toEqual([2, 4, 1, 3]);
		expect(await sorted("code", "desc")).toEqual([3, 1, 4, 2]);
		// Usage 1, 0, 2, 0: the two without use go by id.
		expect(await sorted("usage", "asc")).toEqual([2, 4, 1, 3]);
		expect(await sorted("usage", "desc")).toEqual([3, 1, 4, 2]);
		// Without a date a promotion sorts before the ones that have one.
		expect(await sorted("startsOn", "asc")).toEqual([2, 4, 3, 1]);
		expect(await sorted("startsOn", "desc")).toEqual([1, 3, 4, 2]);
		expect(await sorted("endsOn", "asc")).toEqual([2, 4, 1, 3]);
		expect(await sorted("endsOn", "desc")).toEqual([3, 1, 4, 2]);
	});

	test("filters by status, and the total follows", async () => {
		expect(ids(await list("status=active"))).toEqual([3, 1]);
		const inactive = await list("status=inactive");
		expect(ids(inactive)).toEqual([2]);
		expect(inactive.total).toBe(1);
		expect(ids(await list("status=archived"))).toEqual([4]);
	});

	test("searches part of the code, in any case", async () => {
		expect(ids(await list("q=spring"))).toEqual([1]);
		expect(ids(await list("q=10"))).toEqual([1]);
		expect(ids(await list("q=ELC"))).toEqual([3]);
		expect(ids(await list("q=e&sort=code&dir=asc"))).toEqual([3]);
		expect(ids(await list("q=o&sort=code&dir=asc"))).toEqual([2, 4, 3]);
		expect(ids(await list("q=o&status=archived"))).toEqual([4]);
		const none = await list("q=zzz");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
		// A wildcard is a letter to look for, not a pattern.
		expect(ids(await list("q=%25"))).toEqual([]);
	});

	test("refuses an unknown sort, a page size it does not offer and a status it does not have", async () => {
		for (const query of [
			"sort=value",
			"sort=password",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"status=draft",
			"q=",
		]) {
			const res = await app.request(`/promotions?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /promotions/:id", () => {
	test("is the promotion with the latest orders that used it", async () => {
		const res = await app.request("/promotions/1");
		expect(res.status).toBe(200);
		const promotion = (await res.json()) as Row & {
			recentOrders: { code: string }[];
		};
		expect(promotion).toMatchObject({
			code: "SPRING10",
			usage: 1,
			termsLocked: true,
		});
		expect(promotion.recentOrders.map((o) => o.code)).toEqual(["O-2", "O-1"]);
		expect((await app.request("/promotions/99")).status).toBe(404);
	});
});

describe("POST /promotions", () => {
	const create = (body: Record<string, unknown>) =>
		send("POST", "/promotions", {
			code: "nuevo15",
			type: "percentage",
			value: 15,
			translations: { es: { description: "15% menos" } },
			...body,
		});

	test("creates the promotion inactive, in capitals, with its texts and an audit event", async () => {
		const res = await create({
			translations: {
				es: { description: "15% menos" },
				en: { description: "15% off" },
			},
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as Row;
		expect(created).toMatchObject({
			id: 5,
			code: "NUEVO15",
			status: "inactive",
			usage: 0,
			termsLocked: false,
			minSubtotal: null,
			usageLimit: null,
		});
		expect(created.translations).toHaveLength(2);
		expect(texts(5)).toEqual([
			{ locale: "en", description: "15% off" },
			{ locale: "es", description: "15% menos" },
		]);
		expect(
			db.query("select action, entity_id from audit_events").all(),
		).toEqual([{ action: "promotion.create", entity_id: "5" }]);
	});

	test("takes every field", async () => {
		const res = await create({
			code: "FULL",
			type: "fixed",
			value: 250,
			minSubtotal: 1500,
			startsOn: "2026-05-01",
			endsOn: "2026-05-31",
			usageLimit: 100,
			perCustomerLimit: 1,
			status: "active",
		});
		expect(res.status).toBe(201);
		expect(stored(5)).toMatchObject({
			code: "FULL",
			type: "fixed",
			value: 250,
			min_subtotal: 1500,
			starts_on: "2026-05-01",
			ends_on: "2026-05-31",
			usage_limit: 100,
			per_customer_limit: 1,
			status: "active",
		});
	});

	test("refuses a code that exists, a missing default text and terms that make no sense", async () => {
		const taken = await create({ code: "spring10" });
		expect(taken.status).toBe(409);
		expect(await taken.text()).toBe(
			JSON.stringify({ error: "duplicate_code" }),
		);
		const untranslated = await create({
			translations: { en: { description: "15% off" } },
		});
		expect(untranslated.status).toBe(409);
		expect(await untranslated.text()).toBe(
			JSON.stringify({
				error: "publish_requires_default_translation",
			}),
		);
		for (const [body, path] of [
			[{ value: 150 }, "value"],
			[{ startsOn: "2026-06-01", endsOn: "2026-05-01" }, "endsOn"],
			[{ code: "no" }, "code"],
			[{ code: "con espacio" }, "code"],
			[{ value: 0 }, "value"],
			[{ minSubtotal: 0 }, "minSubtotal"],
			[{ usageLimit: 0 }, "usageLimit"],
			[{ startsOn: "2026-02-31" }, "startsOn"],
		] as const) {
			const res = await create(body);
			expect(res.status).toBe(400);
			const json = (await res.json()) as {
				error: string;
				issues: { path: string }[];
			};
			expect(json.error).toBe("invalid_request");
			expect(json.issues.map((i) => i.path)).toContain(path);
		}
		expect(db.query("select count(*) as n from promotions").get()).toEqual({
			n: 4,
		});
	});

	test("a percentage may be a hundred and a fixed amount may exceed it", async () => {
		expect((await create({ code: "ALL", value: 100 })).status).toBe(201);
		expect(
			(await create({ code: "BIG", type: "fixed", value: 150 })).status,
		).toBe(201);
	});
});

describe("PATCH /promotions/:id", () => {
	const patch = (id: number, body: unknown) =>
		send("PATCH", `/promotions/${id}`, body);

	test("fixes the code and its terms once an order used the code, cancelled or not", async () => {
		// SPRING10 has a live order, OLD20 only a cancelled one.
		for (const id of [1, 4]) {
			for (const body of [
				{ code: "OTHER" },
				{ type: "fixed" },
				{ value: 11 },
				{ minSubtotal: 100 },
			]) {
				const res = await patch(id, body);
				expect(res.status).toBe(409);
				expect(await res.text()).toBe(
					JSON.stringify({ error: "promotion_in_use" }),
				);
			}
		}
		expect(stored(1)).toMatchObject({
			code: "SPRING10",
			type: "percentage",
			value: 10,
			min_subtotal: null,
		});
		expect(db.query("select count(*) as n from audit_events").get()).toEqual({
			n: 0,
		});
	});

	test("still changes the dates, limits, status and texts of a promotion that was used", async () => {
		const res = await patch(1, {
			startsOn: "2026-03-05",
			endsOn: null,
			usageLimit: 50,
			perCustomerLimit: 2,
			status: "inactive",
			translations: {
				es: { description: "Primavera" },
				en: { description: "Spring" },
			},
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			status: "inactive",
			usage: 1,
			termsLocked: true,
			translations: expect.arrayContaining([
				{ promotionId: 1, locale: "es", description: "Primavera" },
				{ promotionId: 1, locale: "en", description: "Spring" },
			]),
		});
		expect(stored(1)).toMatchObject({
			code: "SPRING10",
			value: 10,
			starts_on: "2026-03-05",
			ends_on: null,
			usage_limit: 50,
			per_customer_limit: 2,
			status: "inactive",
		});
		expect(texts(1)).toEqual([
			{ locale: "en", description: "Spring" },
			{ locale: "es", description: "Primavera" },
		]);
	});

	test("accepts the terms it already has, even when they are fixed", async () => {
		const res = await patch(1, {
			code: "SPRING10",
			type: "percentage",
			value: 10,
			minSubtotal: null,
			status: "inactive",
		});
		expect(res.status).toBe(200);
		expect(stored(1).status).toBe("inactive");
	});

	test("changes the terms of a promotion no order used", async () => {
		const res = await patch(2, {
			code: "cinco",
			type: "percentage",
			value: 5,
			minSubtotal: null,
		});
		expect(res.status).toBe(200);
		expect(stored(2)).toMatchObject({
			code: "CINCO",
			type: "percentage",
			value: 5,
			min_subtotal: null,
		});
	});

	test("changes only the texts, adding a language", async () => {
		const res = await patch(3, {
			translations: { en: { description: "Welcome" } },
		});
		expect(res.status).toBe(200);
		expect(texts(3)).toEqual([
			{ locale: "en", description: "Welcome" },
			{ locale: "es", description: "Bienvenida" },
		]);
		expect(stored(3).status).toBe("active");
	});

	test("records one audit event with the status move", async () => {
		await patch(2, { status: "active" });
		await patch(2, { status: "archived" });
		await patch(2, { usageLimit: 3 });
		expect(
			db.query("select action, entity_id from audit_events order by id").all(),
		).toEqual([
			{ action: "promotion.status", entity_id: "2" },
			{ action: "promotion.archive", entity_id: "2" },
			{ action: "promotion.update", entity_id: "2" },
		]);
	});

	test("refuses a code another promotion has and terms that make no sense", async () => {
		const taken = await patch(2, { code: "welcome" });
		expect(taken.status).toBe(409);
		expect(await taken.text()).toBe(
			JSON.stringify({ error: "duplicate_code" }),
		);
		for (const [id, body, path] of [
			[2, { type: "percentage" }, "value"],
			[2, { value: 150, type: "percentage" }, "value"],
			[1, { startsOn: "2026-04-01" }, "endsOn"],
			[2, { startsOn: "2026-02-31" }, "startsOn"],
		] as const) {
			const res = await patch(id, body);
			expect(res.status).toBe(400);
			const json = (await res.json()) as { issues: { path: string }[] };
			expect(json.issues.map((i) => i.path)).toContain(path);
		}
		for (const body of [{}, { translations: {} }, { value: 0 }]) {
			const res = await patch(2, body);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
		expect((await patch(99, { status: "active" })).status).toBe(404);
		expect(stored(2)).toMatchObject({ code: "FIJO5", value: 500 });
	});
});
