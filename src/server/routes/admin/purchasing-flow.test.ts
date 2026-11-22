import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import { storeToday } from "#/lib/dates";
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
const { apiError } = await import("#/server/api-error");

// With the API's error handler: the database's refusals are answers, not failures.
const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/purchase-orders", purchasingRouter)
	.onError(apiError);

const send = (method: string, path: string, body?: unknown) =>
	app.request(`/purchase-orders${path}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
const json = (res: Response): Promise<unknown> => res.json();
const jsonOf = async <T>(res: Response) => (await res.json()) as T;

let db: Database;
const count = (table: string) =>
	(db.query(`select count(*) as n from ${table}`).get() as { n: number }).n;
const statusOf = (id: number) =>
	(
		db.query("select status from purchase_orders where id = ?").get(id) as {
			status: string;
		}
	).status;

beforeEach(() => {
	db = migratedDatabase();
	seedSupply(db);
	env.DB = d1(db);
	addSupplier(db, { name: "Alpha", leadTimeDays: 7 });
	addSupplier(db, { name: "Beta", leadTimeDays: 14 });
});

describe("POST /purchase-orders", () => {
	const lines = [
		{ variantId: PAD_M, quantity: 10, unitCost: 700 },
		{ variantId: PAD_XL, quantity: 5, unitCost: 1200 },
	];

	test("writes a draft with its lines, and an order that already has a date as ordered", async () => {
		const draft = await send("POST", "", {
			supplierId: 1,
			reference: "PO-1",
			notes: "  First  ",
			items: lines,
		});
		expect(draft.status).toBe(201);
		expect(await json(draft)).toEqual({ id: 1, reference: "PO-1" });
		expect(
			db
				.query(
					"select status, ordered_on, tax_included, notes, created_by from purchase_orders where id = 1",
				)
				.get(),
		).toEqual({
			status: "draft",
			ordered_on: null,
			tax_included: null,
			notes: "First",
			created_by: "admin",
		});
		expect(
			db
				.query(
					"select variant_id, quantity, unit_cost from purchase_order_items where purchase_order_id = 1 order by id",
				)
				.all(),
		).toEqual([
			{ variant_id: PAD_M, quantity: 10, unit_cost: 700 },
			{ variant_id: PAD_XL, quantity: 5, unit_cost: 1200 },
		]);
		expect(
			db
				.query(
					"select action, entity_type, entity_id, actor_user_id from audit_events",
				)
				.all(),
		).toEqual([
			{
				action: "purchase_order.create",
				entity_type: "purchase_order",
				entity_id: "1",
				actor_user_id: "admin",
			},
		]);

		const ordered = await send("POST", "", {
			supplierId: 2,
			reference: "PO-2",
			orderedOn: "2026-10-04",
			taxIncluded: true,
			items: lines,
		});
		expect(await json(ordered)).toEqual({ id: 2, reference: "PO-2" });
		expect(
			db
				.query(
					"select status, ordered_on, tax_included from purchase_orders where id = 2",
				)
				.get(),
		).toEqual({ status: "ordered", ordered_on: "2026-10-04", tax_included: 1 });
	});

	test("refuses a reference the supplier already uses, until that purchase order is cancelled", async () => {
		const body = { supplierId: 1, reference: "PO-1", items: lines };
		expect((await send("POST", "", body)).status).toBe(201);
		const again = await send("POST", "", body);
		expect(again.status).toBe(409);
		expect(await json(again)).toMatchObject({ error: "duplicate_reference" });
		expect(count("purchase_orders")).toBe(1);
		// Another supplier may use the same reference.
		expect((await send("POST", "", { ...body, supplierId: 2 })).status).toBe(
			201,
		);
		expect((await send("POST", "/1/cancel")).status).toBe(200);
		expect((await send("POST", "", body)).status).toBe(201);
	});

	test("refuses an archived or unknown supplier and a size that does not exist", async () => {
		db.exec("update suppliers set status = 'archived' where id = 2");
		const archived = await send("POST", "", {
			supplierId: 2,
			reference: "PO-1",
			items: lines,
		});
		expect(archived.status).toBe(409);
		expect(await json(archived)).toEqual({ error: "supplier_archived" });
		const unknown = await send("POST", "", {
			supplierId: 9,
			reference: "PO-1",
			items: lines,
		});
		expect(unknown.status).toBe(404);
		const noSize = await send("POST", "", {
			supplierId: 1,
			reference: "PO-1",
			items: [{ variantId: 99, quantity: 1, unitCost: 100 }],
		});
		expect(noSize.status).toBe(409);
		expect(await json(noSize)).toEqual({ error: "variant_unavailable" });
		expect(count("purchase_orders")).toBe(0);
	});

	test("refuses a purchase order without lines or with a line that makes no sense", async () => {
		for (const items of [
			[],
			[{ variantId: PAD_M, quantity: 0, unitCost: 100 }],
			[{ variantId: PAD_M, quantity: 1, unitCost: -1 }],
		]) {
			const res = await send("POST", "", {
				supplierId: 1,
				reference: "PO-1",
				items,
			});
			expect(res.status).toBe(400);
		}
		expect(count("purchase_orders")).toBe(0);
	});
});

describe("a purchase order's status", () => {
	test("is placed from a draft once, and a draft or ordered one can be cancelled once", async () => {
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-1",
			status: "draft",
			items: [{ variantId: PAD_M, quantity: 1, unitCost: 100 }],
		});
		const order = await send("POST", "/1/order", { orderedOn: "2026-10-04" });
		expect(order.status).toBe(200);
		expect(
			db
				.query("select status, ordered_on from purchase_orders where id = 1")
				.get(),
		).toEqual({ status: "ordered", ordered_on: "2026-10-04" });
		const twice = await send("POST", "/1/order", { orderedOn: "2026-10-05" });
		expect(twice.status).toBe(409);
		expect(await json(twice)).toEqual({ error: "invalid_transition" });

		expect((await send("POST", "/1/cancel")).status).toBe(200);
		expect(statusOf(1)).toBe("cancelled");
		expect((await send("POST", "/1/cancel")).status).toBe(409);
		expect((await send("POST", "/9/cancel")).status).toBe(404);
		expect(
			db
				.query("select action from audit_events order by id")
				.all()
				.map((e) => (e as { action: string }).action),
		).toEqual(["purchase_order.status", "purchase_order.status"]);
	});

	test("cannot be placed when the supplier was archived meanwhile", async () => {
		addPurchase(db, {
			supplierId: 2,
			reference: "PO-1",
			status: "draft",
			items: [{ variantId: PAD_M, quantity: 1, unitCost: 100 }],
		});
		db.exec("update suppliers set status = 'archived' where id = 2");
		const res = await send("POST", "/1/order", { orderedOn: "2026-10-04" });
		expect(res.status).toBe(409);
		expect(await json(res)).toEqual({ error: "supplier_archived" });
		expect(statusOf(1)).toBe("draft");
	});

	test("lets a draft be edited, its lines kept, changed, added and dropped, and nothing else", async () => {
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-1",
			status: "draft",
			items: [
				{ variantId: PAD_M, quantity: 10, unitCost: 700 },
				{ variantId: PAD_XL, quantity: 5, unitCost: 1200 },
			],
		});
		const edit = await send("PATCH", "/1", {
			reference: "PO-1B",
			notes: "Rush",
			taxIncluded: false,
			items: [
				{ id: 1, variantId: PAD_M, quantity: 12, unitCost: 650 },
				{ variantId: MOU_BLACK, quantity: 3, unitCost: 500 },
			],
		});
		expect(edit.status).toBe(200);
		expect(
			db
				.query(
					"select reference, notes, tax_included, status from purchase_orders where id = 1",
				)
				.get(),
		).toEqual({
			reference: "PO-1B",
			notes: "Rush",
			tax_included: 0,
			status: "draft",
		});
		expect(
			db
				.query(
					"select variant_id, quantity, unit_cost from purchase_order_items where purchase_order_id = 1 order by id",
				)
				.all(),
		).toEqual([
			{ variant_id: PAD_M, quantity: 12, unit_cost: 650 },
			{ variant_id: MOU_BLACK, quantity: 3, unit_cost: 500 },
		]);

		await send("POST", "/1/order", { orderedOn: "2026-10-04" });
		const late = await send("PATCH", "/1", { reference: "PO-1C" });
		expect(late.status).toBe(409);
		expect(await json(late)).toEqual({ error: "invalid_transition" });
		const foreign = await send("PATCH", "/9", { reference: "X" });
		expect(foreign.status).toBe(404);
	});
});

describe("POST /purchase-orders/:id/receive", () => {
	const receipt = {
		receivedOn: "2026-10-02",
		supplierInvoiceRef: "F-1",
		shippingCost: 140,
		notes: "All in one box",
		lots: [
			{
				purchaseOrderItemId: 1,
				quantity: 10,
				code: "L-9",
			},
			{ purchaseOrderItemId: 2, quantity: 4 },
		],
	};

	beforeEach(() => {
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-1",
			status: "ordered",
			orderedOn: "2026-10-01",
			items: [
				{ variantId: PAD_M, quantity: 10, unitCost: 700 },
				{ variantId: MOU_BLACK, quantity: 4, unitCost: 500 },
			],
		});
	});

	// Nothing of a refused receipt is written.
	const untouched = () => {
		expect(count("purchase_receipts")).toBe(0);
		expect(count("lots")).toBe(0);
		expect(count("inventory_movements")).toBe(0);
		expect(statusOf(1)).toBe("ordered");
	};

	test("turns each line into a lot with its landed cost, a receive movement and the day's receipt", async () => {
		const res = await send("POST", "/1/receive", receipt);
		expect(res.status).toBe(200);
		expect(await json(res)).toEqual({ ok: true, status: "received" });
		expect(statusOf(1)).toBe("received");
		expect(
			db
				.query("select variant_id, code, unit_cost_e4 from lots order by id")
				.all(),
		).toEqual([
			{
				variant_id: PAD_M,
				code: "L-9",
				// 700.00 plus 10889 hundredths of a cent of shipping, over 10 units.
				unit_cost_e4: 71089,
			},
			{
				variant_id: MOU_BLACK,
				code: null,
				unit_cost_e4: 50778,
			},
		]);
		expect(
			db
				.query(
					"select lot_id, kind, quantity, created_by from inventory_movements order by id",
				)
				.all(),
		).toEqual([
			{ lot_id: 1, kind: "receive", quantity: 10, created_by: "admin" },
			{ lot_id: 2, kind: "receive", quantity: 4, created_by: "admin" },
		]);
		expect(
			db
				.query(
					"select received_on, supplier_invoice_ref, shipping_cost, notes from purchase_receipts",
				)
				.all(),
		).toEqual([
			{
				received_on: "2026-10-02",
				supplier_invoice_ref: "F-1",
				shipping_cost: 140,
				notes: "All in one box",
			},
		]);
		expect(
			db
				.query(
					"select allocated_shipping_e4 from purchase_receipt_lines order by id",
				)
				.all(),
		).toEqual([
			{ allocated_shipping_e4: 10889 },
			{ allocated_shipping_e4: 3111 },
		]);
		const [event] = db.query("select action, data from audit_events").all() as {
			action: string;
			data: string;
		}[];
		expect(event.action).toBe("purchase_receipt.create");
		expect(JSON.parse(event.data)).toMatchObject({
			purchaseOrderId: 1,
			from: "ordered",
			to: "received",
			shippingCost: 140,
			units: 14,
		});
	});

	test("takes a delivery in parts: partially received until every unit has arrived", async () => {
		const first = await send("POST", "/1/receive", {
			receivedOn: "2026-10-02",
			shippingCost: 0,
			lots: [{ purchaseOrderItemId: 1, quantity: 6 }],
		});
		expect(await json(first)).toEqual({
			ok: true,
			status: "partially_received",
		});
		expect(statusOf(1)).toBe("partially_received");

		const second = await send("POST", "/1/receive", {
			receivedOn: "2026-10-03",
			shippingCost: 0,
			lots: [
				{ purchaseOrderItemId: 1, quantity: 4 },
				{ purchaseOrderItemId: 2, quantity: 4 },
			],
		});
		expect(await json(second)).toEqual({ ok: true, status: "received" });
		expect(count("purchase_receipts")).toBe(2);
		expect(count("lots")).toBe(3);

		const detail = await jsonOf<{ receipts: { lines: unknown[] }[] }>(
			await send("GET", "/1"),
		);
		expect(detail.receipts.map((r) => r.lines.length)).toEqual([1, 2]);

		const third = await send("POST", "/1/receive", {
			receivedOn: "2026-10-03",
			shippingCost: 0,
			lots: [{ purchaseOrderItemId: 1, quantity: 1 }],
		});
		expect(third.status).toBe(409);
		expect(await json(third)).toEqual({ error: "purchase_order_not_open" });
	});

	test("refuses more than what is still expected, also when two lots of a line add up to it", async () => {
		const over = await send("POST", "/1/receive", {
			...receipt,
			lots: [{ purchaseOrderItemId: 1, quantity: 11 }],
		});
		expect(over.status).toBe(409);
		expect(await json(over)).toEqual({
			error: "receipt_exceeds_ordered",
			purchaseOrderItemId: 1,
			remaining: 10,
		});
		const split = await send("POST", "/1/receive", {
			...receipt,
			lots: [
				{ purchaseOrderItemId: 1, quantity: 6 },
				{ purchaseOrderItemId: 1, quantity: 6 },
			],
		});
		expect(split.status).toBe(409);
		expect(await json(split)).toMatchObject({
			error: "receipt_exceeds_ordered",
		});
		untouched();
	});

	test("refuses a line from another purchase order", async () => {
		const foreign = await send("POST", "/1/receive", {
			...receipt,
			lots: [{ purchaseOrderItemId: 99, quantity: 1 }],
		});
		expect(foreign.status).toBe(400);
		expect(await json(foreign)).toEqual({
			error: "item_not_in_purchase_order",
		});
		untouched();
	});

	test("refuses a delivery dated in the future or before the order", async () => {
		const lot = [{ purchaseOrderItemId: 1, quantity: 1 }];
		const tomorrow = new Date(Date.now() + 2 * 86_400_000)
			.toISOString()
			.slice(0, 10);
		const future = await send("POST", "/1/receive", {
			...receipt,
			receivedOn: tomorrow,
			lots: lot,
		});
		expect(future.status).toBe(400);
		expect(await json(future)).toEqual({ error: "received_on_in_future" });
		const early = await send("POST", "/1/receive", {
			...receipt,
			receivedOn: "2026-09-30",
			lots: lot,
		});
		expect(early.status).toBe(400);
		expect(await json(early)).toEqual({ error: "received_before_ordered" });
		untouched();
	});

	test("refuses a purchase order that is a draft or cancelled, one that does not exist, and a missing shipping cost", async () => {
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-2",
			status: "draft",
			items: [{ variantId: PAD_M, quantity: 1, unitCost: 100 }],
		});
		addPurchase(db, {
			supplierId: 1,
			reference: "PO-3",
			status: "cancelled",
			items: [{ variantId: PAD_M, quantity: 1, unitCost: 100 }],
		});
		for (const id of [2, 3]) {
			const res = await send("POST", `/${id}/receive`, receipt);
			expect(res.status).toBe(409);
			expect(await json(res)).toEqual({ error: "purchase_order_not_open" });
		}
		expect((await send("POST", "/9/receive", receipt)).status).toBe(404);
		const { shippingCost: _, ...noShipping } = receipt;
		const blank = await send("POST", "/1/receive", noShipping);
		expect(blank.status).toBe(400);
		untouched();
	});
});

describe("POST /purchase-orders/from-reorder", () => {
	const today = storeToday("America/El_Salvador");
	const body = {
		supplierId: 1,
		targetWeeks: 4,
		variantIds: [PAD_M, PAD_XL],
	};

	beforeEach(() => {
		// Alpha sells both pads (the M in packs of 6, at least 8), Beta the mouse. Nothing has
		// sold, so only the points below the stock suggest.
		db.exec(`
update variants set reorder_point = 4 where id = ${PAD_XL};
update variants set reorder_point = 3 where id = ${MOU_BLACK};
insert into supplier_items (supplier_id, variant_id, pack_size, min_order_quantity) values (1, ${PAD_M}, 6, 8), (1, ${PAD_XL}, NULL, NULL), (2, ${MOU_BLACK}, NULL, NULL);
`);
		// The M was bought once at 7.00 and its 5 units were written off: no stock, but a
		// cost to start the draft from.
		addPurchase(db, {
			supplierId: 1,
			reference: "OLD",
			status: "received",
			items: [{ variantId: PAD_M, quantity: 5, unitCost: 700, received: 5 }],
		});
		db.exec(
			"insert into inventory_movements (lot_id, kind, quantity, reason, created_by) values (1, 'waste', -5, 'damaged', 'admin')",
		);
	});

	test("starts a draft from the suggestions of the supplier, in whole packs and at the last cost", async () => {
		const res = await send("POST", "/from-reorder", body);
		expect(res.status).toBe(201);
		expect(await json(res)).toEqual({ id: 2, reference: today });
		expect(
			db
				.query(
					"select supplier_id, reference, status, ordered_on, tax_included, notes, created_by from purchase_orders where id = 2",
				)
				.get(),
		).toEqual({
			supplier_id: 1,
			reference: today,
			status: "draft",
			ordered_on: null,
			tax_included: null,
			notes: null,
			created_by: "admin",
		});
		expect(
			db
				.query(
					"select variant_id, quantity, unit_cost from purchase_order_items where purchase_order_id = 2 order by variant_id",
				)
				.all(),
		).toEqual([
			// 10 to reach the reorder point, over the minimum of 8, in packs of 6.
			{ variant_id: PAD_M, quantity: 12, unit_cost: 700 },
			// 4 to reach its point; never bought, so no cost yet.
			{ variant_id: PAD_XL, quantity: 4, unit_cost: 0 },
		]);
		const events = db
			.query(
				"select action, entity_id from audit_events where entity_type = 'purchase_order'",
			)
			.all();
		expect(events).toEqual([
			{ action: "purchase_order.create", entity_id: "2" },
		]);
	});

	test("takes only the sizes chosen, and leaves out those another supplier sells or that need nothing", async () => {
		const only = await send("POST", "/from-reorder", {
			...body,
			variantIds: [PAD_XL],
		});
		expect(only.status).toBe(201);
		expect(
			db
				.query(
					"select variant_id from purchase_order_items where purchase_order_id = 2",
				)
				.all(),
		).toEqual([{ variant_id: PAD_XL }]);

		// The mouse is Beta's: asked from Alpha it is left out.
		const mixed = await send("POST", "/from-reorder", {
			...body,
			variantIds: [PAD_M, MOU_BLACK],
		});
		expect(mixed.status).toBe(201);
		expect(
			db
				.query(
					"select variant_id from purchase_order_items where purchase_order_id = 3",
				)
				.all(),
		).toEqual([{ variant_id: PAD_M }]);

		const none = await send("POST", "/from-reorder", {
			...body,
			variantIds: [MOU_BLACK],
		});
		expect(none.status).toBe(409);
		expect(await json(none)).toEqual({ error: "nothing_to_order" });
		expect(count("purchase_orders")).toBe(3);
	});

	test("numbers the reference when the supplier already has a draft of the day, and reuses a cancelled one", async () => {
		const refs: string[] = [];
		for (const _ of [1, 2, 3]) {
			const res = await send("POST", "/from-reorder", body);
			refs.push((await jsonOf<{ reference: string }>(res)).reference);
		}
		expect(refs).toEqual([today, `${today}-2`, `${today}-3`]);
		// The one numbered 3 is the fourth purchase order: the first is the old one.
		expect((await send("POST", "/4/cancel")).status).toBe(200);
		const again = await send("POST", "/from-reorder", body);
		expect((await jsonOf<{ reference: string }>(again)).reference).toBe(
			`${today}-3`,
		);
	});

	test("refuses a supplier that is archived or unknown, and a request with no sizes or too many", async () => {
		db.exec("update suppliers set status = 'archived' where id = 2");
		const archived = await send("POST", "/from-reorder", {
			...body,
			supplierId: 2,
			variantIds: [MOU_BLACK],
		});
		expect(archived.status).toBe(409);
		expect(await json(archived)).toEqual({ error: "supplier_archived" });
		expect(
			(await send("POST", "/from-reorder", { ...body, supplierId: 9 })).status,
		).toBe(404);
		for (const variantIds of [
			[],
			Array.from({ length: 101 }, (_, n) => n + 1),
		]) {
			const res = await send("POST", "/from-reorder", { ...body, variantIds });
			expect(res.status).toBe(400);
		}
		expect(count("purchase_orders")).toBe(1);
	});
});
