import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";
import { addPurchase, addSupplier, PAD_M, seedSupply } from "./supply-fixtures";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { suppliersRouter } = await import("./suppliers");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/suppliers", suppliersRouter);

type Row = {
	id: number;
	name: string;
	status: string;
	leadTimeDays: number | null;
	openPurchaseOrders: number;
};
type Page = {
	items: Row[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/suppliers${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const names = (page: Page) => page.items.map((s) => s.name);
const json = (res: Response): Promise<unknown> => res.json();

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	seedSupply(db);
	env.DB = d1(db);
	// Ids 1 to 4. Lead times: Alpha and delta share 7 days, Gamma does not know its own.
	addSupplier(db, {
		name: "Alpha Peripherals",
		contactName: "Ángela",
		leadTimeDays: 7,
		createdAt: "2026-09-01T10:00:00Z",
	});
	addSupplier(db, {
		name: "beta imports",
		leadTimeDays: 14,
		createdAt: "2026-09-02T10:00:00Z",
	});
	addSupplier(db, { name: "Gamma", createdAt: "2026-09-03T10:00:00Z" });
	addSupplier(db, {
		name: "delta supply",
		leadTimeDays: 7,
		createdAt: "2026-09-04T10:00:00Z",
	});
	const line = { variantId: PAD_M, quantity: 5, unitCost: 700 };
	// Alpha has two open purchase orders and a received one; beta a partly received one;
	// Gamma only a cancelled one.
	addPurchase(db, {
		supplierId: 1,
		reference: "A-1",
		status: "draft",
		items: [line],
	});
	addPurchase(db, {
		supplierId: 1,
		reference: "A-2",
		status: "ordered",
		items: [line],
	});
	addPurchase(db, {
		supplierId: 1,
		reference: "A-3",
		status: "received",
		items: [{ ...line, received: 5 }],
	});
	addPurchase(db, {
		supplierId: 2,
		reference: "B-1",
		status: "partially_received",
		items: [{ ...line, received: 2 }],
	});
	addPurchase(db, {
		supplierId: 3,
		reference: "G-1",
		status: "cancelled",
		items: [line],
	});
	// A supplier is archived after it has purchase orders: new ones need an active one.
	db.exec("update suppliers set status = 'archived' where name = 'Gamma'");
});

describe("GET /suppliers", () => {
	test("pages by name ignoring case, with the total and the open purchase orders", async () => {
		const page = await list();
		expect(names(page)).toEqual([
			"Alpha Peripherals",
			"beta imports",
			"delta supply",
			"Gamma",
		]);
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		// Draft, ordered and partly received are open; received and cancelled are not.
		expect(page.items.map((s) => s.openPurchaseOrders)).toEqual([2, 1, 0, 0]);
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			names(await list(`sort=${sort}&dir=${dir}`));
		expect(await sorted("name", "desc")).toEqual([
			"Gamma",
			"delta supply",
			"beta imports",
			"Alpha Peripherals",
		]);
		// Nobody knows Gamma's lead time: unknown comes first when ascending.
		expect(await sorted("leadTimeDays", "asc")).toEqual([
			"Gamma",
			"Alpha Peripherals",
			"delta supply",
			"beta imports",
		]);
		expect(await sorted("leadTimeDays", "desc")).toEqual([
			"beta imports",
			"delta supply",
			"Alpha Peripherals",
			"Gamma",
		]);
		expect(await sorted("openPurchaseOrders", "asc")).toEqual([
			"Gamma",
			"delta supply",
			"beta imports",
			"Alpha Peripherals",
		]);
		expect(await sorted("openPurchaseOrders", "desc")).toEqual([
			"Alpha Peripherals",
			"beta imports",
			"delta supply",
			"Gamma",
		]);
		expect(await sorted("createdAt", "asc")).toEqual([
			"Alpha Peripherals",
			"beta imports",
			"Gamma",
			"delta supply",
		]);
		expect(await sorted("createdAt", "desc")).toEqual([
			"delta supply",
			"Gamma",
			"beta imports",
			"Alpha Peripherals",
		]);
	});

	test("filters by status, and the total follows", async () => {
		const archived = await list("status=archived");
		expect(names(archived)).toEqual(["Gamma"]);
		expect(archived.total).toBe(1);
		expect(names(await list("status=active"))).toEqual([
			"Alpha Peripherals",
			"beta imports",
			"delta supply",
		]);
	});

	test("searches the name and the contact, ignoring accents and case", async () => {
		expect(names(await list("q=DELTA"))).toEqual(["delta supply"]);
		expect(names(await list("q=angela"))).toEqual(["Alpha Peripherals"]);
		expect(names(await list("q=a&status=active&sort=name&dir=desc"))).toEqual([
			"delta supply",
			"beta imports",
			"Alpha Peripherals",
		]);
		expect((await list("q=nobody")).items).toEqual([]);
	});

	test("takes the page size and page asked for, and answers a page past the end empty", async () => {
		for (let n = 1; n <= 8; n++) addSupplier(db, { name: `Extra ${n}` });
		const first = await list("pageSize=10&sort=name&dir=asc");
		expect(first.items).toHaveLength(10);
		expect(first).toMatchObject({ total: 12, pageSize: 10, pageCount: 2 });
		const second = await list("pageSize=10&page=2&sort=name&dir=asc");
		expect(names(second)).toEqual(["Extra 8", "Gamma"]);
		expect(await list("pageSize=10&page=9")).toMatchObject({
			items: [],
			total: 12,
			page: 9,
			pageCount: 2,
		});
	});

	test("refuses an unknown sort, a page size it does not offer and a status that does not exist", async () => {
		for (const query of [
			"sort=password",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"status=deleted",
		]) {
			const res = await app.request(`/suppliers?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /suppliers/options", () => {
	test("offers every supplier by name, or those with a status", async () => {
		const all = await app.request("/suppliers/options");
		expect(await json(all)).toEqual([
			{ id: 1, name: "Alpha Peripherals", leadTimeDays: 7, status: "active" },
			{ id: 2, name: "beta imports", leadTimeDays: 14, status: "active" },
			{ id: 4, name: "delta supply", leadTimeDays: 7, status: "active" },
			{ id: 3, name: "Gamma", leadTimeDays: null, status: "archived" },
		]);
		const active = await app.request("/suppliers/options?status=active");
		expect(
			((await active.json()) as { id: number }[]).map((s) => s.id),
		).toEqual([1, 2, 4]);
		const bad = await app.request("/suppliers/options?status=maybe");
		expect(bad.status).toBe(400);
	});
});

describe("GET /suppliers/:id", () => {
	test("carries the purchase orders that are not finished, the newest first", async () => {
		addPurchase(db, {
			supplierId: 1,
			reference: "A-4",
			status: "ordered",
			createdAt: "2026-10-05T10:00:00Z",
			items: [{ variantId: PAD_M, quantity: 3, unitCost: 500 }],
		});
		const res = await app.request("/suppliers/1");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Row & {
			openOrders: {
				reference: string;
				status: string;
				units: number;
				total: number;
			}[];
		};
		expect(body).toMatchObject({
			id: 1,
			name: "Alpha Peripherals",
			openPurchaseOrders: 3,
		});
		expect(body.openOrders.map((o) => o.reference)).toEqual([
			"A-4",
			"A-2",
			"A-1",
		]);
		expect(body.openOrders[0]).toMatchObject({
			status: "ordered",
			units: 3,
			total: 1500,
		});
		const empty = (await (await app.request("/suppliers/3")).json()) as {
			openOrders: unknown[];
		};
		expect(empty.openOrders).toEqual([]);
	});

	test("answers 404 for a supplier that does not exist", async () => {
		const res = await app.request("/suppliers/99");
		expect(res.status).toBe(404);
		expect(await json(res)).toEqual({ error: "not_found" });
	});
});
