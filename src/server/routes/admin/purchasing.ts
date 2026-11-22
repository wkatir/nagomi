import { and, eq, inArray, like, ne, not, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { now } from "#/db/schema";
import { storeToday } from "#/lib/dates";
import { calendarDate } from "#/lib/schemas/dates";
import { reorderSearch } from "#/lib/schemas/inventory";
import { purchaseListSearch } from "#/lib/schemas/purchasing";
import type { AdminEnv } from "#/server/auth";
import { idParam, patchOf, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { inList, insertIfExists, qualified } from "../../domain/d1";
import { pagedPurchases, purchaseDetail } from "../../domain/purchase-queries";
import {
	allocateLandedCost,
	ReceiptExceedsOrderedError,
	receiptDateProblem,
	receiptOutcome,
} from "../../domain/receiving";
import { getSettings } from "../../domain/settings";
import { money, optionalText } from "./catalog-inputs";
import { reorderReport } from "./reports";

const {
	inventoryMovements,
	lots,
	purchaseOrderItems,
	purchaseOrders,
	purchaseReceiptLines,
	purchaseReceipts,
	suppliers,
	variants,
} = schema;

const notesText = optionalText(1000);

const createInput = z.object({
	supplierId: z.number().int().positive(),
	reference: z.string().trim().min(1).max(40),
	orderedOn: calendarDate.optional(),
	taxIncluded: z.boolean().nullable().default(null),
	notes: notesText.optional(),
	// A variant may appear on several lines (e.g. free units at cost 0).
	items: z
		.array(
			z.object({
				variantId: z.number().int().positive(),
				quantity: z.number().int().positive().max(100_000),
				unitCost: money,
			}),
		)
		.min(1)
		.max(100),
});

const reorderDraftInput = z.object({
	...reorderSearch.shape,
	leadTimeDays: z.number().int().min(0).max(365).optional(),
	supplierId: z.number().int().positive(),
	variantIds: z.array(z.number().int().positive()).min(1).max(100),
});

const editInput = patchOf(
	z.object({
		reference: z.string().trim().min(1).max(40),
		notes: notesText,
		taxIncluded: z.boolean().nullable(),
		items: z
			.array(
				z.object({
					id: z.number().int().positive().optional(),
					variantId: z.number().int().positive(),
					quantity: z.number().int().positive().max(100_000),
					unitCost: money,
				}),
			)
			.min(1)
			.max(100),
	}),
);

const receiveInput = z.object({
	receivedOn: calendarDate,
	supplierInvoiceRef: z.string().trim().min(1).max(60).optional(),
	shippingCost: money,
	notes: notesText.optional(),
	lots: z
		.array(
			z.object({
				purchaseOrderItemId: z.number().int().positive(),
				quantity: z.number().int().positive(),
				code: z.string().trim().min(1).max(40).optional(),
			}),
		)
		.min(1)
		.max(100),
});

const receivedOf = (itemId: typeof purchaseOrderItems.id) =>
	sql<number>`(select coalesce(sum(${purchaseReceiptLines.quantity}), 0) from ${purchaseReceiptLines} where ${qualified(purchaseReceiptLines.purchaseOrderItemId)} = ${qualified(itemId)})`;

// A reference the supplier already used on an order that is not cancelled fails the first insert.
async function createPurchaseOrder(
	db: Db,
	actor: string,
	po: {
		supplierId: number;
		reference: string;
		orderedOn: string | null;
		taxIncluded: boolean | null;
		notes: string | null;
		items: { variantId: number; quantity: number; unitCost: number }[];
	},
) {
	const { items, ...fields } = po;
	const poId = sql<number>`(select id from purchase_orders where supplier_id = ${po.supplierId} and reference = ${po.reference} and status <> 'cancelled')`;
	const [[created]] = await db.batch([
		db
			.insert(purchaseOrders)
			.values({
				...fields,
				status: fields.orderedOn ? "ordered" : "draft",
				createdBy: actor,
			})
			.returning({ id: purchaseOrders.id }),
		// One statement per item keeps each under D1's 100 bound parameters.
		...items.map((i) =>
			db.insert(purchaseOrderItems).values({ purchaseOrderId: poId, ...i }),
		),
		audit(db, {
			actorUserId: actor,
			action: "purchase_order.create",
			entityType: "purchase_order",
			entityId: poId,
			data: {
				supplierId: po.supplierId,
				reference: po.reference,
				items: items.length,
			},
		}),
	]);
	if (!created)
		throw new Error(`Purchase order ${po.reference} was not written`);
	return created.id;
}

export const purchasingRouter = new Hono<AdminEnv>()
	.get("/", validate("query", purchaseListSearch), async (c) => {
		const db = getDb();
		const { timeZone } = await getSettings(db);
		return c.json(await pagedPurchases(db, timeZone, c.req.valid("query")));
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const { defaultLocale } = await getSettings(db);
		const detail = await purchaseDetail(db, defaultLocale, id);
		return detail ? c.json(detail) : c.json({ error: "not_found" }, 404);
	})
	// A size never bought starts at cost 0, to be filled in.
	.post("/from-reorder", validate("json", reorderDraftInput), async (c) => {
		const db = getDb();
		const { supplierId, variantIds, ...params } = c.req.valid("json");
		const [supplier, settings] = await Promise.all([
			db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) }),
			getSettings(db),
		]);
		if (!supplier) return c.json({ error: "not_found" }, 404);
		if (supplier.status !== "active")
			return c.json({ error: "supplier_archived" }, 409);
		const report = await reorderReport(db, settings, params);
		const lines = report.variants.filter(
			(v) =>
				v.supplier?.supplierId === supplierId &&
				v.orderQuantity > 0 &&
				variantIds.includes(v.variantId),
		);
		if (lines.length === 0) return c.json({ error: "nothing_to_order" }, 409);
		const taken = await db
			.select({ reference: purchaseOrders.reference })
			.from(purchaseOrders)
			.where(
				and(
					eq(purchaseOrders.supplierId, supplierId),
					ne(purchaseOrders.status, "cancelled"),
					like(purchaseOrders.reference, `${report.asOf}%`),
				),
			);
		let reference: string = report.asOf;
		for (let n = 2; taken.some((t) => t.reference === reference); n++)
			reference = `${report.asOf}-${n}`;
		const id = await createPurchaseOrder(db, c.var.adminUserId, {
			supplierId,
			reference,
			orderedOn: null,
			taxIncluded: null,
			notes: null,
			items: lines.map((v) => ({
				variantId: v.variantId,
				quantity: v.orderQuantity,
				unitCost: v.unitCost ?? 0,
			})),
		});
		return c.json({ id, reference }, 201);
	})
	.post("/", validate("json", createInput), async (c) => {
		const db = getDb();
		const input = c.req.valid("json");
		const actor = c.var.adminUserId;
		const variantIds = [...new Set(input.items.map((i) => i.variantId))];
		const [supplier, found] = await Promise.all([
			db.query.suppliers.findFirst({
				where: eq(suppliers.id, input.supplierId),
			}),
			db
				.select({ id: variants.id })
				.from(variants)
				.where(inList(variants.id, variantIds)),
		]);
		if (!supplier) return c.json({ error: "not_found" }, 404);
		if (supplier.status !== "active")
			return c.json({ error: "supplier_archived" }, 409);
		if (found.length !== variantIds.length)
			return c.json({ error: "variant_unavailable" }, 409);
		const id = await createPurchaseOrder(db, actor, {
			supplierId: input.supplierId,
			reference: input.reference,
			orderedOn: input.orderedOn ?? null,
			taxIncluded: input.taxIncluded,
			notes: input.notes ?? null,
			items: input.items,
		});
		return c.json({ id, reference: input.reference }, 201);
	})
	.patch(
		"/:id",
		validate("param", idParam),
		validate("json", editInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { items, ...fields } = c.req.valid("json");
			const po = await db.query.purchaseOrders.findFirst({
				where: eq(purchaseOrders.id, id),
			});
			if (!po) return c.json({ error: "not_found" }, 404);
			if (po.status !== "draft")
				return c.json({ error: "invalid_transition" }, 409);
			const variantIds = [...new Set((items ?? []).map((i) => i.variantId))];
			const [found, current] = await Promise.all([
				variantIds.length === 0
					? []
					: db
							.select({ id: variants.id })
							.from(variants)
							.where(inList(variants.id, variantIds)),
				db
					.select({ id: purchaseOrderItems.id })
					.from(purchaseOrderItems)
					.where(eq(purchaseOrderItems.purchaseOrderId, id)),
			]);
			if (found.length !== variantIds.length)
				return c.json({ error: "variant_unavailable" }, 409);
			if (items?.some((i) => i.id && !current.some((x) => x.id === i.id)))
				return c.json({ error: "item_not_in_purchase_order" }, 400);
			const draft = and(
				eq(purchaseOrders.id, id),
				eq(purchaseOrders.status, "draft"),
			);
			const stillDraft = db
				.select({ id: purchaseOrders.id })
				.from(purchaseOrders)
				.where(draft);
			const kept = (items ?? []).flatMap((i) => (i.id ? [i.id] : []));
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						action: "purchase_order.update",
						entityType: "purchase_order",
						entityId: id,
						data: c.req.valid("json"),
					},
					stillDraft,
				),
				...(items
					? [
							db
								.delete(purchaseOrderItems)
								.where(
									and(
										eq(purchaseOrderItems.purchaseOrderId, id),
										not(inList(purchaseOrderItems.id, kept)),
										sql`exists ${stillDraft}`,
									),
								),
							...items.map(({ id: itemId, ...line }) =>
								itemId
									? db
											.update(purchaseOrderItems)
											.set(line)
											.where(
												and(
													eq(purchaseOrderItems.id, itemId),
													sql`exists ${stillDraft}`,
												),
											)
									: insertIfExists(
											db,
											purchaseOrderItems,
											{ purchaseOrderId: id, ...line },
											stillDraft,
										),
							),
						]
					: []),
				// Sets the status it already has, so the statement always reports whether the
				// purchase order was still a draft.
				db
					.update(purchaseOrders)
					.set({ ...fields, status: "draft" })
					.where(draft),
			]);
			if (!results[results.length - 1].meta.changes)
				return c.json({ error: "invalid_transition" }, 409);
			return c.json({ ok: true });
		},
	)
	.post(
		"/:id/order",
		validate("param", idParam),
		validate("json", z.object({ orderedOn: calendarDate })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { orderedOn } = c.req.valid("json");
			const draft = and(
				eq(purchaseOrders.id, id),
				eq(purchaseOrders.status, "draft"),
			);
			const [, ordered] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						action: "purchase_order.status",
						entityType: "purchase_order",
						entityId: id,
						data: { from: "draft", to: "ordered", orderedOn },
					},
					db
						.select({ id: purchaseOrders.id })
						.from(purchaseOrders)
						.where(draft),
				),
				db
					.update(purchaseOrders)
					.set({ status: "ordered", orderedOn })
					.where(draft),
			]);
			if (!ordered.meta.changes)
				return c.json({ error: "invalid_transition" }, 409);
			return c.json({ ok: true });
		},
	)
	.post("/:id/cancel", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const po = await db.query.purchaseOrders.findFirst({
			where: eq(purchaseOrders.id, id),
		});
		if (!po) return c.json({ error: "not_found" }, 404);
		const open = and(
			eq(purchaseOrders.id, id),
			eq(purchaseOrders.status, po.status),
			inArray(purchaseOrders.status, [
				"draft",
				"ordered",
				"partially_received",
			]),
		);
		const [, cancelled] = await db.batch([
			audit(
				db,
				{
					actorUserId: c.var.adminUserId,
					action: "purchase_order.status",
					entityType: "purchase_order",
					entityId: id,
					data: { from: po.status, to: "cancelled" },
				},
				db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(open),
			),
			db
				.update(purchaseOrders)
				.set({ status: "cancelled", cancelledAt: now })
				.where(open),
		]);
		if (!cancelled.meta.changes)
			return c.json({ error: "invalid_transition" }, 409);
		return c.json({ ok: true });
	})
	// The database refuses a receipt for a purchase order that is not open and any line
	// beyond what is still expected, so concurrent receipts cannot over-receive.
	.post(
		"/:id/receive",
		validate("param", idParam),
		validate("json", receiveInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const po = await db.query.purchaseOrders.findFirst({
				where: eq(purchaseOrders.id, id),
			});
			if (!po) return c.json({ error: "not_found" }, 404);
			if (po.status !== "ordered" && po.status !== "partially_received")
				return c.json({ error: "purchase_order_not_open" }, 409);
			const { timeZone } = await getSettings(db);
			const items = await db
				.select({
					id: purchaseOrderItems.id,
					variantId: purchaseOrderItems.variantId,
					ordered: purchaseOrderItems.quantity,
					received: receivedOf(purchaseOrderItems.id),
					unitCost: purchaseOrderItems.unitCost,
				})
				.from(purchaseOrderItems)
				.where(eq(purchaseOrderItems.purchaseOrderId, id));
			if (
				input.lots.some(
					(l) => !items.some((i) => i.id === l.purchaseOrderItemId),
				)
			)
				return c.json({ error: "item_not_in_purchase_order" }, 400);
			let outcome: ReturnType<typeof receiptOutcome>;
			try {
				outcome = receiptOutcome(items, input.lots);
			} catch (e) {
				if (e instanceof ReceiptExceedsOrderedError)
					return c.json(
						{
							error: "receipt_exceeds_ordered",
							purchaseOrderItemId: e.purchaseOrderItemId,
							remaining: e.remaining,
						},
						409,
					);
				throw e;
			}
			const dateProblem = receiptDateProblem({
				receivedOn: input.receivedOn,
				orderedOn: po.orderedOn,
				today: storeToday(timeZone),
			});
			if (dateProblem) return c.json({ error: dateProblem }, 400);
			const lines = input.lots.map((l, index) => {
				const item = items.find((i) => i.id === l.purchaseOrderItemId);
				if (!item) throw new Error(`Unchecked lot ${index}`);
				return { ...l, item };
			});
			const landed = allocateLandedCost(
				lines.map((l) => ({ quantity: l.quantity, unitCost: l.item.unitCost })),
				input.shippingCost,
			);

			const receiptId = sql<number>`(select max(id) from purchase_receipts where purchase_order_id = ${id})`;
			const results = await db.batch([
				db.insert(purchaseReceipts).values({
					purchaseOrderId: id,
					receivedOn: input.receivedOn,
					supplierInvoiceRef: input.supplierInvoiceRef ?? null,
					shippingCost: input.shippingCost,
					notes: input.notes ?? null,
					createdBy: actor,
				}),
				// Each statement reads the row inserted by the one before it.
				...lines.flatMap((l, index) => {
					const cost = landed[index];
					if (!cost) throw new Error(`No landed cost for lot ${index}`);
					return [
						db.insert(purchaseReceiptLines).values({
							receiptId,
							purchaseOrderItemId: l.item.id,
							quantity: l.quantity,
							allocatedShippingE4: cost.allocatedShippingE4,
						}),
						db.insert(lots).values({
							variantId: l.item.variantId,
							receiptLineId: sql<number>`last_insert_rowid()`,
							code: l.code ?? null,
							unitCostE4: cost.unitCostE4,
						}),
						db.insert(inventoryMovements).values({
							lotId: sql<number>`last_insert_rowid()`,
							kind: "receive",
							quantity: l.quantity,
							createdBy: actor,
						}),
					];
				}),
				db
					.update(purchaseOrders)
					.set({
						status: sql`(case when exists (select 1 from ${purchaseOrderItems} where ${purchaseOrderItems.purchaseOrderId} = ${id} and ${purchaseOrderItems.quantity} > ${receivedOf(purchaseOrderItems.id)}) then 'partially_received' else 'received' end)`,
					})
					.where(eq(purchaseOrders.id, id))
					.returning({ status: purchaseOrders.status }),
				audit(db, {
					actorUserId: actor,
					action: "purchase_receipt.create",
					entityType: "purchase_receipt",
					entityId: receiptId,
					data: {
						purchaseOrderId: id,
						from: po.status,
						to: outcome,
						receivedOn: input.receivedOn,
						shippingCost: input.shippingCost,
						units: input.lots.reduce((n, l) => n + l.quantity, 0),
					},
				}),
			]);
			const [stored] = results.at(-2) as { status: string }[];
			if (!stored) throw new Error(`Purchase order ${id} vanished on receipt`);
			return c.json({ ok: true, status: stored.status });
		},
	);
