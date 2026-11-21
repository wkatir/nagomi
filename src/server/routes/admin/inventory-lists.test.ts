import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import { addDays, storeToday } from "#/lib/dates";
import type { AdminEnv } from "#/server/auth";
import {
	addPurchase,
	addSupplier,
	CRM_30,
	OIL_50,
	OIL_100,
	seedSupply,
} from "./supply-fixtures";

const env: {
	DB?: ReturnType<typeof d1>;
	EXPORT_LIMITER?: { limit: () => Promise<{ success: boolean }> };
} = {};
mock.module("cloudflare:workers", () => ({ env }));
const { inventoryRouter } = await import("./inventory");
const { exportsRouter } = await import("./exports");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/inventory", inventoryRouter)
	.route("/exports", exportsRouter);

const json = (res: Response): Promise<unknown> => res.json();
const get = async <T>(path: string): Promise<T> => {
	const res = await app.request(path);
	expect(res.status).toBe(200);
	return (await res.json()) as T;
};

type Paged<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
type StockRow = {
	variantId: number;
	sku: string;
	brand: string;
	name: string;
	onHand: number;
	stockValue: number;
	expiringUnits: number;
	expiringValue: number;
	expiredUnits: number;
	expiredValue: number;
	reorderPoint: number | null;
	belowReorderPoint: boolean;
};
type LotRow = {
	lotId: number;
	code: string | null;
	sku: string;
	available: number;
	received: number;
	unitCost: number;
	value: number;
	daysLeft: number;
	expired: boolean;
	expiringSoon: boolean;
	expiry: string;
	reference: string;
};
type Movement = {
	id: number;
	kind: string;
	quantity: number;
	sku: string;
	lotId: number;
	reason: string | null;
	orderCode: string | null;
};
type Feed = { items: Movement[]; nextCursor: number | null };

const stock = (query = "") =>
	get<Paged<StockRow>>(`/inventory${query ? `?${query}` : ""}`);
const lotList = (query = "") =>
	get<Paged<LotRow>>(`/inventory/lots${query ? `?${query}` : ""}`);
const feed = (query = "") =>
	get<Feed>(`/inventory/movements${query ? `?${query}` : ""}`);
const skus = (page: Paged<{ sku: string }>) => page.items.map((i) => i.sku);
const ids = (f: Feed) => f.items.map((m) => m.id);

const today = storeToday("America/El_Salvador");
let db: Database;

beforeEach(() => {
	db = migratedDatabase();
	seedSupply(db);
	env.DB = d1(db);
	env.EXPORT_LIMITER = { limit: async () => ({ success: true }) };
	addSupplier(db, { name: "Alpha" });
	// Lots 1 to 5. The 50 ml has a lot about to expire (30 days, the store warns at 90) and
	// one with plenty of life; the 100 ml has a lot that expired five days ago; the cream
	// has a lot to sell and one that sold out.
	addPurchase(db, {
		supplierId: 1,
		reference: "PO-1",
		status: "received",
		receipt: { at: "2026-10-01T10:00:00Z" },
		items: [
			{
				variantId: OIL_50,
				quantity: 10,
				unitCost: 700,
				received: 10,
				lotCode: "L1",
				expiresOn: addDays(today, 30),
			},
			{
				variantId: OIL_50,
				quantity: 20,
				unitCost: 600,
				received: 20,
				lotCode: "L2",
				expiresOn: addDays(today, 400),
			},
			{
				variantId: OIL_100,
				quantity: 6,
				unitCost: 1200,
				received: 6,
				lotCode: "L3",
				expiresOn: addDays(today, -5),
			},
			{
				variantId: CRM_30,
				quantity: 8,
				unitCost: 500,
				received: 8,
				lotCode: "L4",
				expiresOn: addDays(today, 200),
			},
		],
	});
	addPurchase(db, {
		supplierId: 1,
		reference: "PO-2",
		status: "received",
		orderedOn: "2026-10-02",
		receipt: { at: "2026-10-02T10:00:00Z" },
		items: [
			{
				variantId: CRM_30,
				quantity: 3,
				unitCost: 500,
				received: 3,
				lotCode: "L5",
				expiresOn: addDays(today, 100),
			},
		],
	});
	// The ledger after the receipts (movements 6 to 9). The sale happened at 21:00 of
	// October 15 in the store, which is October 16 in UTC.
	db.exec(`
update variants set reorder_point = 8 where id = ${CRM_30};
insert into variants (product_id, sku, search_key, status) values (1, 'OIL-200', 'oil-200', 'archived'), (2, 'NEW-1', 'new-1', 'active');
insert into inventory_movements (lot_id, kind, quantity, reason, note, created_by, created_at) values (2, 'waste', -2, 'damaged', 'Dropped', 'admin', '2026-10-10T15:00:00Z');
insert into inventory_movements (lot_id, kind, quantity, reason, created_by, created_at) values (5, 'waste', -3, 'expired', 'admin', '2026-10-12T15:00:00Z');
insert into inventory_movements (lot_id, kind, quantity, reason, created_by, created_at) values (1, 'adjustment', -1, 'count_difference', 'admin', '2026-10-14T15:00:00Z');
insert into orders (id, code, idempotency_key, request_hash, locale, channel, status, subtotal, total, search_key, created_at) values (1, 'ECL-1', 'k1', 'h', 'es', 'whatsapp', 'pending', 1400, 1400, 'ecl-1', '2026-10-15T12:00:00Z');
insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (1, ${OIL_50}, 2, 700, 'OIL-50', 'Brand', 'Aceite');
update orders set status = 'confirmed', confirmed_at = '2026-10-15T12:00:00Z', payment_method = 'cash', shipping_method = 'pickup', delivery_estimate_from = '2099-01-01', delivery_estimate_to = '2099-01-01', confirmation_message = 'm' where id = 1;
insert into inventory_movements (lot_id, kind, quantity, order_item_id, created_by, created_at) values (1, 'sale', -2, 1, 'admin', '2026-10-16T03:00:00Z');
`);
});

describe("GET /inventory", () => {
	test("gives the stock of each size: what can be sold and its value, what expires soon, what expired", async () => {
		const page = await stock();
		expect(skus(page)).toEqual(["OIL-50", "OIL-100", "CRM-30", "NEW-1"]);
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const bySku = Object.fromEntries(page.items.map((r) => [r.sku, r]));
		// Lot 1: 10 - 1 - 2 = 7 at 7.00, expiring. Lot 2: 20 - 2 = 18 at 6.00.
		expect(bySku["OIL-50"]).toMatchObject({
			brand: "Brand",
			name: "Aceite",
			sizeValue: 50,
			sizeUnit: "ml",
			reorderPoint: 10,
			onHand: 25,
			stockValue: 4900 + 10800,
			expiringUnits: 7,
			expiringValue: 4900,
			expiredUnits: 0,
			expiredValue: 0,
			belowReorderPoint: false,
		});
		// Expired units are not stock: they wait to be written off.
		expect(bySku["OIL-100"]).toMatchObject({
			onHand: 0,
			stockValue: 0,
			expiringUnits: 0,
			expiredUnits: 6,
			expiredValue: 7200,
			reorderPoint: null,
			belowReorderPoint: false,
		});
		// 8 in lot 4; lot 5 sold out (3 received, 3 written off). At its reorder point.
		expect(bySku["CRM-30"]).toMatchObject({
			onHand: 8,
			stockValue: 4000,
			reorderPoint: 8,
			belowReorderPoint: true,
		});
		// A size never bought is listed with nothing; an archived one without stock is not.
		expect(bySku["NEW-1"]).toMatchObject({
			onHand: 0,
			stockValue: 0,
			expiringUnits: 0,
			expiredUnits: 0,
		});
		expect(bySku["OIL-200"]).toBeUndefined();
	});

	test("lists an archived size while it still holds units", async () => {
		db.exec("update variants set status = 'active' where sku = 'OIL-200'");
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-3",
			status: "received",
			items: [
				{
					variantId: 4,
					quantity: 5,
					unitCost: 300,
					received: 5,
					expiresOn: addDays(today, 300),
				},
			],
		});
		db.exec("update variants set status = 'archived' where sku = 'OIL-200'");
		const page = await stock("sort=sku&dir=asc");
		expect(skus(page)).toEqual([
			"CRM-30",
			"NEW-1",
			"OIL-100",
			"OIL-200",
			"OIL-50",
		]);
		expect(page.items.find((r) => r.sku === "OIL-200")).toMatchObject({
			onHand: 5,
			stockValue: 1500,
			variantStatus: "archived",
		});
	});

	test("counts a lot that expires today as stock that is about to expire, not as expired", async () => {
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-3",
			status: "received",
			items: [
				{
					variantId: 5,
					quantity: 4,
					unitCost: 100,
					received: 4,
					lotCode: "L6",
					expiresOn: today,
				},
			],
		});
		const page = await stock("q=NEW-1");
		expect(page.items[0]).toMatchObject({
			sku: "NEW-1",
			onHand: 4,
			stockValue: 400,
			expiringUnits: 4,
			expiringValue: 400,
			expiredUnits: 0,
		});
		expect(skus(await stock("view=expired"))).toEqual(["OIL-100"]);
		expect(await get<unknown>("/inventory/summary")).toMatchObject({
			units: 25 + 8 + 4,
			expiringUnits: 7 + 4,
			expiredUnits: 6,
		});
		const lots = (view: string) =>
			lotList(`view=${view}`).then((l) => l.items.map((i) => i.code));
		expect(await lots("expiring")).toEqual(["L6", "L1"]);
		expect(await lots("expired")).toEqual(["L3"]);
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			skus(await stock(`sort=${sort}&dir=${dir}`));
		expect(await sorted("product", "desc")).toEqual([
			"NEW-1",
			"CRM-30",
			"OIL-100",
			"OIL-50",
		]);
		expect(await sorted("sku", "asc")).toEqual([
			"CRM-30",
			"NEW-1",
			"OIL-100",
			"OIL-50",
		]);
		expect(await sorted("sku", "desc")).toEqual([
			"OIL-50",
			"OIL-100",
			"NEW-1",
			"CRM-30",
		]);
		expect(await sorted("onHand", "asc")).toEqual([
			"OIL-100",
			"NEW-1",
			"CRM-30",
			"OIL-50",
		]);
		expect(await sorted("onHand", "desc")).toEqual([
			"OIL-50",
			"CRM-30",
			"NEW-1",
			"OIL-100",
		]);
		expect(await sorted("stockValue", "asc")).toEqual([
			"OIL-100",
			"NEW-1",
			"CRM-30",
			"OIL-50",
		]);
		expect(await sorted("stockValue", "desc")).toEqual([
			"OIL-50",
			"CRM-30",
			"NEW-1",
			"OIL-100",
		]);
		expect(await sorted("expiringUnits", "asc")).toEqual([
			"OIL-100",
			"CRM-30",
			"NEW-1",
			"OIL-50",
		]);
		expect(await sorted("expiringUnits", "desc")).toEqual([
			"OIL-50",
			"NEW-1",
			"CRM-30",
			"OIL-100",
		]);
		expect(await sorted("expiredUnits", "asc")).toEqual([
			"OIL-50",
			"CRM-30",
			"NEW-1",
			"OIL-100",
		]);
		expect(await sorted("expiredUnits", "desc")).toEqual([
			"OIL-100",
			"NEW-1",
			"CRM-30",
			"OIL-50",
		]);
		// No point set comes first when ascending.
		expect(await sorted("reorderPoint", "asc")).toEqual([
			"OIL-100",
			"NEW-1",
			"CRM-30",
			"OIL-50",
		]);
		expect(await sorted("reorderPoint", "desc")).toEqual([
			"OIL-50",
			"CRM-30",
			"NEW-1",
			"OIL-100",
		]);
	});

	test("narrows to the sizes that are low, out, about to expire or expired, and the total follows", async () => {
		const low = await stock("view=low");
		expect(skus(low)).toEqual(["CRM-30"]);
		expect(low.total).toBe(1);
		expect(skus(await stock("view=out"))).toEqual(["OIL-100", "NEW-1"]);
		expect(skus(await stock("view=expiring"))).toEqual(["OIL-50"]);
		expect(skus(await stock("view=expired"))).toEqual(["OIL-100"]);
	});

	test("searches the product, the brand and the SKU of the size itself", async () => {
		expect(skus(await stock("q=aceite"))).toEqual(["OIL-50", "OIL-100"]);
		expect(skus(await stock("q=OIL-100"))).toEqual(["OIL-100"]);
		expect(skus(await stock("q=BRAND&sort=sku&dir=asc"))).toEqual([
			"CRM-30",
			"NEW-1",
			"OIL-100",
			"OIL-50",
		]);
		expect(skus(await stock("q=crema&view=out"))).toEqual(["NEW-1"]);
		expect((await stock("q=nothing")).items).toEqual([]);
	});

	test("takes the page size and page asked for, and answers a page past the end empty", async () => {
		const first = await stock("pageSize=10");
		expect(first.pageSize).toBe(10);
		for (let n = 1; n <= 8; n++)
			db.exec(
				`insert into variants (product_id, sku, search_key) values (2, 'EXTRA-${n}', 'extra-${n}')`,
			);
		const full = await stock("pageSize=10&sort=sku&dir=asc");
		expect(full).toMatchObject({ total: 12, pageSize: 10, pageCount: 2 });
		expect(full.items).toHaveLength(10);
		expect(skus(await stock("pageSize=10&page=2&sort=sku&dir=asc"))).toEqual([
			"OIL-100",
			"OIL-50",
		]);
		expect(await stock("pageSize=10&page=9")).toMatchObject({
			items: [],
			total: 12,
			page: 9,
			pageCount: 2,
		});
	});

	test("refuses an unknown sort, view or page size", async () => {
		for (const query of [
			"sort=password",
			"view=lost",
			"pageSize=7",
			"page=0",
			"dir=up",
		]) {
			const res = await app.request(`/inventory?${query}`);
			expect(res.status).toBe(400);
			expect(await json(res)).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /inventory/summary", () => {
	test("adds up the whole store: units and value, what expires, what expired, what is low", async () => {
		expect(await get<unknown>("/inventory/summary")).toEqual({
			units: 25 + 8,
			value: 4900 + 10800 + 4000,
			expiringUnits: 7,
			expiringValue: 4900,
			expiredUnits: 6,
			expiredValue: 7200,
			belowReorderPoint: 1,
		});
	});

	test("is all zero for a store without lots, though a size with a reorder point is low", async () => {
		const empty = migratedDatabase();
		seedSupply(empty);
		env.DB = d1(empty);
		expect(await get<unknown>("/inventory/summary")).toEqual({
			units: 0,
			value: 0,
			expiringUnits: 0,
			expiringValue: 0,
			expiredUnits: 0,
			expiredValue: 0,
			belowReorderPoint: 1,
		});
	});
});

describe("GET /inventory/lots", () => {
	test("lists the lots that hold units, earliest expiry first, with what was received and its value", async () => {
		const page = await lotList();
		// Lot 5 sold out and is not listed.
		expect(page.items.map((l) => l.code)).toEqual(["L3", "L1", "L4", "L2"]);
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const byCode = Object.fromEntries(page.items.map((l) => [l.code, l]));
		expect(byCode.L1).toMatchObject({
			lotId: 1,
			sku: "OIL-50",
			brand: "Brand",
			name: "Aceite",
			expiry: addDays(today, 30),
			daysLeft: 30,
			expired: false,
			expiringSoon: true,
			available: 7,
			received: 10,
			unitCost: 700,
			value: 4900,
			reference: "PO-1",
		});
		expect(byCode.L2).toMatchObject({
			available: 18,
			received: 20,
			expiringSoon: false,
		});
		expect(byCode.L3).toMatchObject({
			daysLeft: -5,
			expired: true,
			expiringSoon: true,
			available: 6,
			value: 7200,
		});
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			(await lotList(`sort=${sort}&dir=${dir}`)).items.map((l) => l.code);
		expect(await sorted("expiresOn", "desc")).toEqual(["L2", "L4", "L1", "L3"]);
		expect(await sorted("product", "asc")).toEqual(["L1", "L2", "L3", "L4"]);
		expect(await sorted("product", "desc")).toEqual(["L4", "L3", "L2", "L1"]);
		expect(await sorted("sku", "asc")).toEqual(["L4", "L3", "L1", "L2"]);
		expect(await sorted("sku", "desc")).toEqual(["L2", "L1", "L3", "L4"]);
		expect(await sorted("code", "asc")).toEqual(["L1", "L2", "L3", "L4"]);
		expect(await sorted("code", "desc")).toEqual(["L4", "L3", "L2", "L1"]);
		expect(await sorted("available", "asc")).toEqual(["L3", "L1", "L4", "L2"]);
		expect(await sorted("available", "desc")).toEqual(["L2", "L4", "L1", "L3"]);
		expect(await sorted("unitCost", "asc")).toEqual(["L4", "L2", "L1", "L3"]);
		expect(await sorted("unitCost", "desc")).toEqual(["L3", "L1", "L2", "L4"]);
		expect(await sorted("value", "asc")).toEqual(["L4", "L1", "L3", "L2"]);
		expect(await sorted("value", "desc")).toEqual(["L2", "L3", "L1", "L4"]);
	});

	test("narrows to the lots about to expire or expired, and searches the size or the lot code", async () => {
		const expiring = await lotList("view=expiring");
		expect(expiring.items.map((l) => l.code)).toEqual(["L1"]);
		expect(expiring.total).toBe(1);
		expect((await lotList("view=expired")).items.map((l) => l.code)).toEqual([
			"L3",
		]);
		expect((await lotList("q=l2")).items.map((l) => l.code)).toEqual(["L2"]);
		expect((await lotList("q=OIL-100")).items.map((l) => l.code)).toEqual([
			"L3",
		]);
		expect((await lotList("q=crema")).items.map((l) => l.code)).toEqual(["L4"]);
		expect((await lotList("q=nothing")).items).toEqual([]);
	});

	test("takes the page size and page asked for, and answers a page past the end empty", async () => {
		const second = await lotList("pageSize=10&page=2");
		expect(second).toMatchObject({
			items: [],
			total: 4,
			page: 2,
			pageCount: 1,
		});
		for (let n = 6; n <= 15; n++)
			addPurchase(db, {
				supplierId: 1,
				reference: `X-${n}`,
				status: "received",
				items: [
					{
						variantId: CRM_30,
						quantity: 1,
						unitCost: 100,
						received: 1,
						lotCode: `X${n}`,
						expiresOn: addDays(today, 500 + n),
					},
				],
			});
		const first = await lotList("pageSize=10");
		expect(first).toMatchObject({ total: 14, pageSize: 10, pageCount: 2 });
		expect(
			(await lotList("pageSize=10&page=2")).items.map((l) => l.code),
		).toEqual(["X12", "X13", "X14", "X15"]);
	});

	test("refuses an unknown sort or view", async () => {
		for (const query of ["sort=password", "view=empty", "pageSize=7"]) {
			const res = await app.request(`/inventory/lots?${query}`);
			expect(res.status).toBe(400);
		}
	});
});

describe("GET /inventory/movements", () => {
	test("is the ledger newest first, each movement with its size, lot, cost and order", async () => {
		const all = await feed();
		expect(ids(all)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
		expect(all.nextCursor).toBeNull();
		expect(all.items[0]).toMatchObject({
			id: 9,
			kind: "sale",
			quantity: -2,
			reason: null,
			sku: "OIL-50",
			brand: "Brand",
			name: "Aceite",
			sizeValue: 50,
			sizeUnit: "ml",
			lotId: 1,
			lotCode: "L1",
			expiry: addDays(today, 30),
			unitCost: 700,
			value: -1400,
			orderCode: "ECL-1",
			createdByName: "Admin",
		});
		expect(all.items[3]).toMatchObject({
			id: 6,
			kind: "waste",
			quantity: -2,
			reason: "damaged",
			note: "Dropped",
			orderCode: null,
			value: -1200,
		});
	});

	test("pages by cursor: each page starts after the last movement of the one before, and the last has no cursor", async () => {
		const first = await feed("limit=4");
		expect(ids(first)).toEqual([9, 8, 7, 6]);
		expect(first.nextCursor).toBe(6);
		const second = await feed("limit=4&cursor=6");
		expect(ids(second)).toEqual([5, 4, 3, 2]);
		expect(second.nextCursor).toBe(2);
		const last = await feed("limit=4&cursor=2");
		expect(ids(last)).toEqual([1]);
		expect(last.nextCursor).toBeNull();
		// A page that ends exactly with the ledger has no next one.
		expect((await feed("limit=9")).nextCursor).toBeNull();
		expect((await feed("limit=8")).nextCursor).toBe(2);
		expect(await feed("cursor=1")).toEqual({ items: [], nextCursor: null });
	});

	test("filters by kind, reason, size and lot, and the filters hold across pages", async () => {
		expect(ids(await feed("kind=waste"))).toEqual([7, 6]);
		expect(ids(await feed("kind=receive"))).toEqual([5, 4, 3, 2, 1]);
		expect(ids(await feed("reason=damaged"))).toEqual([6]);
		expect(ids(await feed("reason=count_difference"))).toEqual([8]);
		expect(ids(await feed("sku=OIL-50"))).toEqual([9, 8, 6, 2, 1]);
		expect(ids(await feed("sku=CRM-30&kind=waste"))).toEqual([7]);
		expect(ids(await feed("sku=NEW-1"))).toEqual([]);
		expect(ids(await feed("lotId=2"))).toEqual([6, 2]);
		const first = await feed("sku=OIL-50&limit=2");
		expect(ids(first)).toEqual([9, 8]);
		expect(first.nextCursor).toBe(8);
		const second = await feed("sku=OIL-50&limit=2&cursor=8");
		expect(ids(second)).toEqual([6, 2]);
		expect(second.nextCursor).toBe(2);
		expect(ids(await feed("sku=OIL-50&limit=2&cursor=2"))).toEqual([1]);
	});

	test("filters by the days of the store, not of UTC", async () => {
		expect(ids(await feed("from=2026-10-12&to=2026-10-14"))).toEqual([8, 7]);
		// The sale is October 16 in UTC but the evening of October 15 in the store.
		expect(ids(await feed("from=2026-10-15&to=2026-10-15"))).toEqual([9]);
		expect(ids(await feed("from=2026-10-16"))).toEqual([]);
		expect(ids(await feed("to=2026-10-01"))).toEqual([4, 3, 2, 1]);
	});

	test("refuses a kind or reason that does not exist, a bad page and a backwards range", async () => {
		for (const query of [
			"kind=theft",
			"reason=boredom",
			"limit=0",
			"limit=201",
			"cursor=0",
			"from=2026-10-05&to=2026-10-01",
		]) {
			const res = await app.request(`/inventory/movements?${query}`);
			expect(res.status).toBe(400);
			expect(await json(res)).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /exports/movements.csv", () => {
	const lines = async (query: string) =>
		(await (await app.request(`/exports/movements.csv?${query}`)).text())
			.trim()
			.split("\n");

	test("is the ledger the filters show, with the same kind, reason, size and days", async () => {
		const all = await lines("");
		expect(all).toHaveLength(10);
		expect(all[0]).toContain("id,created_at,kind,quantity,reason");
		const damaged = await lines("reason=damaged");
		expect(damaged).toHaveLength(2);
		expect(damaged[1]).toContain(",waste,-2,damaged,Dropped,OIL-50,");
		expect(await lines("sku=CRM-30&kind=waste")).toHaveLength(2);
		expect(await lines("from=2026-10-15&to=2026-10-15")).toHaveLength(2);
	});
});

describe("POST /inventory/adjustments", () => {
	const adjust = (body: unknown) =>
		app.request("/inventory/adjustments", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	const ledger = () =>
		(
			db.query("select count(*) as n from inventory_movements").get() as {
				n: number;
			}
		).n;

	test("writes a loss off a lot as a negative waste with its reason", async () => {
		const res = await adjust({
			lotId: 2,
			kind: "waste",
			quantity: -3,
			reason: "damaged",
			note: "Spilled",
		});
		expect(res.status).toBe(201);
		expect(
			db
				.query(
					"select lot_id, kind, quantity, reason, note, created_by from inventory_movements order by id desc limit 1",
				)
				.get(),
		).toEqual({
			lot_id: 2,
			kind: "waste",
			quantity: -3,
			reason: "damaged",
			note: "Spilled",
			created_by: "admin",
		});
		const [event] = db
			.query("select action, entity_type from audit_events")
			.all();
		expect(event).toEqual({
			action: "inventory_movement.create",
			entity_type: "inventory_movement",
		});
	});

	test("corrects a count up or down, but not below nothing", async () => {
		const up = await adjust({
			lotId: 2,
			kind: "adjustment",
			quantity: 4,
			reason: "count_difference",
		});
		expect(up.status).toBe(201);
		const over = await adjust({
			lotId: 2,
			kind: "adjustment",
			quantity: -23,
			reason: "count_difference",
		});
		expect(over.status).toBe(409);
		expect(await json(over)).toEqual({
			error: "insufficient_stock",
			available: 22,
		});
		expect(ledger()).toBe(10);
	});

	test("refuses a waste that adds, 'other' without a note, a customer return, zero and a lot that does not exist", async () => {
		const base = { lotId: 2, kind: "waste", quantity: -1, reason: "damaged" };
		for (const change of [
			{ quantity: 1 },
			{ reason: "other" },
			{ reason: "customer_return" },
			{ quantity: 0 },
		]) {
			const res = await adjust({ ...base, ...change });
			expect(res.status).toBe(400);
		}
		const missing = await adjust({ ...base, lotId: 99 });
		expect(missing.status).toBe(404);
		expect(ledger()).toBe(9);
	});
});
