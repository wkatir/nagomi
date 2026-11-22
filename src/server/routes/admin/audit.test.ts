import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { auditRouter } = await import("./audit");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/audit-events", auditRouter);

type Event = {
	id: number;
	action: string;
	entityType: string;
	entityId: string;
	data: unknown;
	createdAt: string;
	actorUserId: string;
	actorName: string | null;
	actorEmail: string | null;
};
type Feed = { items: Event[]; nextCursor: number | null };

const feed = async (query = ""): Promise<Feed> => {
	const res = await app.request(`/audit-events${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Feed;
};
const ids = (f: Feed) => f.items.map((e) => e.id);

let db: Database;

function event(e: {
	action: string;
	entityType: string;
	entityId?: string;
	actor?: string;
	data?: unknown;
	createdAt?: string;
}) {
	db.run(
		"insert into audit_events (actor_user_id, action, entity_type, entity_id, data, created_at) values (?, ?, ?, ?, ?, ?)",
		[
			e.actor ?? "ana",
			e.action,
			e.entityType,
			e.entityId ?? "1",
			e.data === undefined ? null : JSON.stringify(e.data),
			e.createdAt ?? "2026-10-10T12:00:00Z",
		],
	);
}

beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5);
insert into users (id, name, email, role) values ('ana', 'Ana Admin', 'ana@example.com', 'admin');
insert into users (id, name, email, role) values ('beto', 'Beto Admin', 'beto@example.com', 'admin');
insert into users (id, name, email, role) values ('idle', 'Idle Admin', 'idle@example.com', 'admin');
`);
	env.DB = d1(db);
});

describe("GET /audit-events", () => {
	test("lists the newest events first, each with its actor by name", async () => {
		event({ action: "order.create", entityType: "order", entityId: "7" });
		event({
			action: "order.status",
			entityType: "order",
			entityId: "7",
			actor: "beto",
			data: { from: "pending", to: "confirmed" },
		});
		const f = await feed();
		expect(f.nextCursor).toBeNull();
		expect(
			f.items.map((e) => [e.id, e.action, e.actorName, e.actorEmail]),
		).toEqual([
			[2, "order.status", "Beto Admin", "beto@example.com"],
			[1, "order.create", "Ana Admin", "ana@example.com"],
		]);
		expect(f.items[0]).toMatchObject({
			entityType: "order",
			entityId: "7",
			actorUserId: "beto",
			createdAt: "2026-10-10T12:00:00Z",
			data: { from: "pending", to: "confirmed" },
		});
		expect(f.items[1].data).toBeNull();
	});

	test("an actor that is not a user has no name", async () => {
		event({ action: "brand.create", entityType: "brand", actor: "gone" });
		const [only] = (await feed()).items;
		expect(only).toMatchObject({
			actorUserId: "gone",
			actorName: null,
			actorEmail: null,
		});
	});

	test("an empty log is an empty feed", async () => {
		expect(await feed()).toEqual({ items: [], nextCursor: null });
	});

	describe("pages", () => {
		beforeEach(() => {
			for (let n = 0; n < 5; n++)
				event({ action: "brand.update", entityType: "brand" });
		});

		test("the cursor of a page is the id of its last event", async () => {
			const first = await feed("limit=2");
			expect(ids(first)).toEqual([5, 4]);
			expect(first.nextCursor).toBe(4);
			const second = await feed(`limit=2&cursor=${first.nextCursor}`);
			expect(ids(second)).toEqual([3, 2]);
			expect(second.nextCursor).toBe(2);
			const last = await feed(`limit=2&cursor=${second.nextCursor}`);
			expect(ids(last)).toEqual([1]);
			expect(last.nextCursor).toBeNull();
		});

		test("a page that ends exactly at the last event has no next cursor", async () => {
			const f = await feed("limit=5");
			expect(ids(f)).toEqual([5, 4, 3, 2, 1]);
			expect(f.nextCursor).toBeNull();
			expect(ids(await feed("limit=4"))).toEqual([5, 4, 3, 2]);
			expect((await feed("limit=4")).nextCursor).toBe(2);
		});

		test("the first page is 50 events", async () => {
			for (let n = 0; n < 50; n++)
				event({ action: "brand.update", entityType: "brand" });
			const f = await feed();
			expect(f.items).toHaveLength(50);
			expect(ids(f)[49]).toBe(6);
			expect(f.nextCursor).toBe(6);
			expect(ids(await feed(`cursor=${f.nextCursor}`))).toEqual([
				5, 4, 3, 2, 1,
			]);
		});

		test("a cursor past the oldest event is an empty feed", async () => {
			expect(await feed("cursor=1")).toEqual({ items: [], nextCursor: null });
		});
	});

	describe("filters", () => {
		beforeEach(() => {
			event({ action: "order.create", entityType: "order", entityId: "1" }); // 1
			event({
				action: "order.status",
				entityType: "order",
				entityId: "1",
				actor: "beto",
			}); // 2
			event({
				action: "order.status",
				entityType: "order",
				entityId: "2",
				actor: "beto",
			}); // 3
			event({
				action: "purchase_order.status",
				entityType: "purchase_order",
				entityId: "1",
			}); // 4
			event({ action: "brand.archive", entityType: "brand", entityId: "1" }); // 5
			event({ action: "brand.update", entityType: "brand", entityId: "1" }); // 6
			// Near misses: ends like a verb, or only starts like an entity.
			event({ action: "brand.unarchive", entityType: "brand", entityId: "1" }); // 7
			event({
				action: "order_line.rename",
				entityType: "return",
				entityId: "1",
			}); // 8
		});

		test("by entity type", async () => {
			expect(ids(await feed("entityType=order"))).toEqual([3, 2, 1]);
			expect(ids(await feed("entityType=purchase_order"))).toEqual([4]);
		});

		test("by entity type and id", async () => {
			expect(ids(await feed("entityType=order&entityId=1"))).toEqual([2, 1]);
			expect(ids(await feed("entityType=order&entityId=9"))).toEqual([]);
		});

		test("an id needs its entity type", async () => {
			const res = await app.request("/audit-events?entityId=1");
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({
				issues: [{ path: "entityId" }],
			});
		});

		test("by actor", async () => {
			expect(ids(await feed("actor=beto"))).toEqual([3, 2]);
			expect(ids(await feed("actor=nobody"))).toEqual([]);
		});

		test("by verb: what follows the dot of the action", async () => {
			expect(ids(await feed("verb=status"))).toEqual([4, 3, 2]);
			expect(ids(await feed("verb=create"))).toEqual([1]);
			expect(ids(await feed("verb=archive"))).toEqual([5]);
			expect(ids(await feed("verb=update"))).toEqual([6]);
		});

		test("by exact action, or by the prefix of an entity", async () => {
			expect(ids(await feed("action=order.status"))).toEqual([3, 2]);
			expect(ids(await feed("action=order."))).toEqual([3, 2, 1]);
		});

		test("filters add up, and so does the cursor", async () => {
			expect(
				ids(await feed("entityType=order&verb=status&actor=beto")),
			).toEqual([3, 2]);
			expect(ids(await feed("entityType=order&verb=status&actor=ana"))).toEqual(
				[],
			);
			const first = await feed("entityType=order&limit=2");
			expect(ids(first)).toEqual([3, 2]);
			expect(first.nextCursor).toBe(2);
			expect(
				ids(await feed(`entityType=order&limit=2&cursor=${first.nextCursor}`)),
			).toEqual([1]);
		});
	});

	describe("days", () => {
		// El Salvador is UTC-6 all year: local days start at 06:00 UTC.
		beforeEach(() => {
			event({
				action: "brand.update",
				entityType: "brand",
				createdAt: "2026-10-02T05:59:59Z",
			}); // 1: October 1, 23:59:59 local
			event({
				action: "brand.update",
				entityType: "brand",
				createdAt: "2026-10-02T06:00:00Z",
			}); // 2: October 2, 00:00:00 local
			event({
				action: "brand.update",
				entityType: "brand",
				createdAt: "2026-10-03T05:59:59Z",
			}); // 3: October 2, 23:59:59 local
			event({
				action: "brand.update",
				entityType: "brand",
				createdAt: "2026-10-03T06:00:00Z",
			}); // 4: October 3 local
		});

		test("from and to are local days, both included", async () => {
			expect(ids(await feed("from=2026-10-02&to=2026-10-02"))).toEqual([3, 2]);
		});

		test("from alone, or to alone, leaves the other end open", async () => {
			expect(ids(await feed("from=2026-10-03"))).toEqual([4]);
			expect(ids(await feed("to=2026-10-01"))).toEqual([1]);
		});

		test("a range with no events is empty", async () => {
			expect(await feed("from=2026-11-01&to=2026-11-30")).toEqual({
				items: [],
				nextCursor: null,
			});
		});

		test("a range that ends before it starts is refused", async () => {
			const res = await app.request(
				"/audit-events?from=2026-10-03&to=2026-10-02",
			);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ issues: [{ path: "to" }] });
		});
	});

	test("refuses what is not a filter value", async () => {
		for (const query of [
			"entityType=nothing",
			"verb=delete",
			"from=2026-02-31",
			"limit=0",
			"limit=201",
			"cursor=0",
		])
			expect((await app.request(`/audit-events?${query}`)).status).toBe(400);
	});
});

describe("GET /audit-events/actors", () => {
	test("lists the users that have acted, by name", async () => {
		event({ action: "brand.create", entityType: "brand", actor: "beto" });
		event({ action: "brand.update", entityType: "brand", actor: "ana" });
		event({ action: "brand.update", entityType: "brand", actor: "ana" });
		event({ action: "brand.update", entityType: "brand", actor: "gone" });
		const res = await app.request("/audit-events/actors");
		expect(res.status).toBe(200);
		const actors: unknown = await res.json();
		expect(actors).toEqual([
			{ id: "ana", name: "Ana Admin", email: "ana@example.com" },
			{ id: "beto", name: "Beto Admin", email: "beto@example.com" },
		]);
	});

	test("nobody has acted yet", async () => {
		const res = await app.request("/audit-events/actors");
		const actors: unknown = await res.json();
		expect(actors).toEqual([]);
	});
});
