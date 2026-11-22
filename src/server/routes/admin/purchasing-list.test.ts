import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";
import {
	addPurchase,
	addSupplier,
	MOU_BLACK,
	PAD_M,
	PAD_XL,
	seedSupply,
} from "./supply-fixtures";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { purchasingRouter } = await import("./purchasing");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/purchase-orders", purchasingRouter);

type Row = {
	id: number;
	reference: string;
	status: string;
	supplierId: number;
	supplier: string;
	units: number;
	receivedUnits: number;
	total: number;
	orderedOn: string | null;
	createdAt: string;
};
type Page = {
	items: Row[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/purchase-orders${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const refs = (page: Page) => page.items.map((p) => p.reference);
const json = (res: Response): Promise<unknown> => res.json();

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	seedSupply(db);
	env.DB = d1(db);
	addSupplier(db, { name: "Alpha", leadTimeDays: 7 });
	addSupplier(db, { name: "Beta", leadTimeDays: 14 });
	// Ids 1 to 5, in the order they were created.
	addPurchase(db, {
		supplierId: 1,
		reference: "PO-100",
		status: "draft",
		createdAt: "2026-10-01T10:00:00Z",
		items: [
			{ variantId: PAD_M, quantity: 10, unitCost: 700 },
			{ variantId: PAD_XL, quantity: 5, unitCost: 1200 },
		],
	});
	addPurchase(db, {
		supplierId: 1,
		reference: "po-200",
		status: "ordered",
		orderedOn: "2026-10-03",
		createdAt: "2026-10-03T12:00:00Z",
		items: [{ variantId: MOU_BLACK, quantity: 4, unitCost: 500 }],
	});
	addPurchase(db, {
		supplierId: 2,
		reference: "B-7",
		status: "partially_received",
		orderedOn: "2026-10-05",
		createdAt: "2026-10-05T12:00:00Z",
		receipt: {
			invoiceRef: "F-77",
			shippingCost: 150,
			notes: "One box dented",
		},
		items: [
			{
				variantId: PAD_M,
				quantity: 20,
				unitCost: 650,
				received: 8,
				lotCode: "L1",
			},
		],
	});
	// 21:00 of October 5 in the store (UTC-6), though October 6 in UTC.
	addPurchase(db, {
		supplierId: 2,
		reference: "B-8",
		status: "received",
		orderedOn: "2026-10-05",
		createdAt: "2026-10-06T03:00:00Z",
		items: [{ variantId: MOU_BLACK, quantity: 2, unitCost: 500, received: 2 }],
	});
	addPurchase(db, {
		supplierId: 1,
		reference: "PO-300",
		status: "cancelled",
		createdAt: "2026-10-07T12:00:00Z",
		items: [{ variantId: PAD_XL, quantity: 1, unitCost: 1300 }],
	});
});

describe("GET /purchase-orders", () => {
	test("pages the newest first, with the units, what arrived and the total of each", async () => {
		const page = await list();
		expect(refs(page)).toEqual(["PO-300", "B-8", "B-7", "po-200", "PO-100"]);
		expect(page).toMatchObject({
			total: 5,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const byReference = Object.fromEntries(
			page.items.map((p) => [p.reference, p]),
		);
		expect(byReference["B-7"]).toEqual({
			id: 3,
			reference: "B-7",
			status: "partially_received",
			supplierId: 2,
			supplier: "Beta",
			orderedOn: "2026-10-05",
			createdAt: "2026-10-05T12:00:00Z",
			units: 20,
			receivedUnits: 8,
			total: 13000,
		});
		expect(byReference["PO-100"]).toMatchObject({
			status: "draft",
			orderedOn: null,
			units: 15,
			receivedUnits: 0,
			total: 13000,
		});
		expect(byReference["B-8"]).toMatchObject({
			units: 2,
			receivedUnits: 2,
			total: 1000,
		});
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			refs(await list(`sort=${sort}&dir=${dir}`));
		expect(await sorted("createdAt", "asc")).toEqual([
			"PO-100",
			"po-200",
			"B-7",
			"B-8",
			"PO-300",
		]);
		expect(await sorted("reference", "asc")).toEqual([
			"B-7",
			"B-8",
			"PO-100",
			"po-200",
			"PO-300",
		]);
		expect(await sorted("reference", "desc")).toEqual([
			"PO-300",
			"po-200",
			"PO-100",
			"B-8",
			"B-7",
		]);
		expect(await sorted("supplier", "asc")).toEqual([
			"PO-100",
			"po-200",
			"PO-300",
			"B-7",
			"B-8",
		]);
		expect(await sorted("supplier", "desc")).toEqual([
			"B-8",
			"B-7",
			"PO-300",
			"po-200",
			"PO-100",
		]);
		expect(await sorted("status", "asc")).toEqual([
			"PO-300",
			"PO-100",
			"po-200",
			"B-7",
			"B-8",
		]);
		expect(await sorted("status", "desc")).toEqual([
			"B-8",
			"B-7",
			"po-200",
			"PO-100",
			"PO-300",
		]);
		expect(await sorted("total", "asc")).toEqual([
			"B-8",
			"PO-300",
			"po-200",
			"PO-100",
			"B-7",
		]);
		expect(await sorted("total", "desc")).toEqual([
			"B-7",
			"PO-100",
			"po-200",
			"PO-300",
			"B-8",
		]);
		// Drafts have no order date: they come first when ascending.
		expect(await sorted("orderedOn", "asc")).toEqual([
			"PO-100",
			"PO-300",
			"po-200",
			"B-7",
			"B-8",
		]);
		expect(await sorted("orderedOn", "desc")).toEqual([
			"B-8",
			"B-7",
			"po-200",
			"PO-300",
			"PO-100",
		]);
	});

	test("filters by status and by supplier, and the total follows", async () => {
		expect(refs(await list("status=received"))).toEqual(["B-8"]);
		const beta = await list("supplierId=2");
		expect(refs(beta)).toEqual(["B-8", "B-7"]);
		expect(beta.total).toBe(2);
		expect(refs(await list("supplierId=1&status=cancelled"))).toEqual([
			"PO-300",
		]);
		expect(await list("status=received&supplierId=1")).toMatchObject({
			items: [],
			total: 0,
			pageCount: 1,
		});
	});

	test("filters by the days of the store, not of UTC", async () => {
		// B-8 was created on October 6 in UTC but on the evening of October 5 in the store.
		expect(refs(await list("from=2026-10-06"))).toEqual(["PO-300"]);
		expect(refs(await list("to=2026-10-05"))).toEqual([
			"B-8",
			"B-7",
			"po-200",
			"PO-100",
		]);
		expect(refs(await list("from=2026-10-03&to=2026-10-05"))).toEqual([
			"B-8",
			"B-7",
			"po-200",
		]);
	});

	test("searches the reference and the supplier, ignoring case", async () => {
		expect(refs(await list("q=PO-&sort=reference&dir=asc"))).toEqual([
			"PO-100",
			"po-200",
			"PO-300",
		]);
		expect(refs(await list("q=200"))).toEqual(["po-200"]);
		expect(refs(await list("q=BETA"))).toEqual(["B-8", "B-7"]);
		expect(refs(await list("q=alpha&status=draft"))).toEqual(["PO-100"]);
		expect((await list("q=nothing")).items).toEqual([]);
	});

	test("takes the page size and page asked for, and answers a page past the end empty", async () => {
		for (let n = 1; n <= 7; n++)
			addPurchase(db, {
				supplierId: 1,
				reference: `X-${n}`,
				createdAt: `2026-09-${String(10 + n)}T10:00:00Z`,
				items: [{ variantId: PAD_M, quantity: 1, unitCost: 100 }],
			});
		const first = await list("pageSize=10");
		expect(first.items).toHaveLength(10);
		expect(first).toMatchObject({ total: 12, pageSize: 10, pageCount: 2 });
		// The five of October, then the seven of September, the newest first.
		expect(refs(first)).toEqual([
			"PO-300",
			"B-8",
			"B-7",
			"po-200",
			"PO-100",
			"X-7",
			"X-6",
			"X-5",
			"X-4",
			"X-3",
		]);
		expect(refs(await list("pageSize=10&page=2"))).toEqual(["X-2", "X-1"]);
		expect(await list("pageSize=10&page=9")).toMatchObject({
			items: [],
			total: 12,
			page: 9,
			pageCount: 2,
		});
	});

	test("refuses an unknown sort, a page size it does not offer, a bad filter and a backwards range", async () => {
		for (const query of [
			"sort=password",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"status=lost",
			"supplierId=0",
			"supplierId=abc",
			"from=2026-10-05&to=2026-10-01",
			"to=2026-02-31",
		]) {
			const res = await app.request(`/purchase-orders?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /purchase-orders/:id", () => {
	test("gives the lines with what arrived of each, and every delivery with its lots", async () => {
		const res = await app.request("/purchase-orders/3");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			id: 3,
			reference: "B-7",
			status: "partially_received",
			supplier: "Beta",
			supplierStatus: "active",
			supplierLeadTimeDays: 14,
			orderedOn: "2026-10-05",
			taxIncluded: null,
			notes: null,
			createdByName: "Admin",
			units: 20,
			receivedUnits: 8,
			total: 13000,
			items: [
				{
					id: 4,
					variantId: PAD_M,
					sku: "PAD-001",
					brand: "Brand",
					name: "Alfombrilla",
					optionLabel: null,
					quantity: 20,
					received: 8,
					unitCost: 650,
				},
			],
			receipts: [
				{
					receivedOn: "2026-10-05",
					supplierInvoiceRef: "F-77",
					shippingCost: 150,
					notes: "One box dented",
					createdByName: "Admin",
					lines: [
						{
							purchaseOrderItemId: 4,
							quantity: 8,
							lotCode: "L1",
							landedUnitCost: 650,
						},
					],
				},
			],
		});
	});

	test("a draft has no deliveries, and its lines show what was asked for", async () => {
		const res = await app.request("/purchase-orders/1");
		const body = (await res.json()) as {
			status: string;
			receipts: unknown[];
			items: { sku: string; quantity: number; received: number }[];
		};
		expect(body.status).toBe("draft");
		expect(body.receipts).toEqual([]);
		expect(body.items.map((i) => [i.sku, i.quantity, i.received])).toEqual([
			["PAD-001", 10, 0],
			["PAD-100", 5, 0],
		]);
	});

	test("answers 404 for a purchase order that does not exist and 400 for a bad id", async () => {
		const missing = await app.request("/purchase-orders/99");
		expect(missing.status).toBe(404);
		expect(await json(missing)).toEqual({ error: "not_found" });
		for (const id of ["0", "abc"]) {
			const res = await app.request(`/purchase-orders/${id}`);
			expect(res.status).toBe(400);
		}
	});
});
