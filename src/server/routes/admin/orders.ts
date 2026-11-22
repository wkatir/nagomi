import { and, eq, inArray, type SQLWrapper, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import {
	now,
	type OrderStatus,
	PAYMENT_METHODS,
	RETURN_DISPOSITIONS,
	RETURN_REASONS,
} from "#/db/schema";
import { orderListSearch } from "#/lib/schemas/orders";
import { type AdminEnv, seesCosts } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { insertIfExists, nextId, qualified } from "../../domain/d1";
import { orderFollowups } from "../../domain/followups";
import { orderDetail, pagedOrders } from "../../domain/order-queries";
import { paidSum, returnedOfLine } from "../../domain/order-sql";
import { canTransition, SHIPPED_STATUSES } from "../../domain/order-state";
import { amountOwed, paymentSummary } from "../../domain/payments";
import {
	planReturn,
	ReturnExceedsSoldError,
	type ReturnLinePlan,
	ReturnLotRequiredError,
	returnMovements,
	type SoldLot,
} from "../../domain/returns";
import { getSettings } from "../../domain/settings";
import { money } from "./catalog-inputs";

const {
	inventoryMovements,
	lots,
	orderItems,
	orders,
	payments,
	returnLines,
	returns,
} = schema;

const returnInput = z.object({
	reason: z.enum(RETURN_REASONS),
	note: z.string().trim().max(500).optional(),
	lines: z
		.array(
			z.object({
				orderItemId: z.number().int().positive(),
				lotId: z.number().int().positive().optional(),
				quantity: z.number().int().positive(),
				disposition: z.enum(RETURN_DISPOSITIONS),
			}),
		)
		.min(1)
		.max(50),
});

const refundInput = z.object({
	amount: money.refine((n) => n > 0, "A refund is positive"),
	method: z.enum(PAYMENT_METHODS),
	reference: z.string().trim().min(1).max(120).optional(),
	returnId: z.number().int().positive().optional(),
});

const invalidTransition = (
	c: { json: (b: unknown, s: 409) => Response },
	action: string,
) => c.json({ error: "invalid_transition", action }, 409);

const returnedUnitsOfOrder = sql<number>`(select coalesce(sum(rl.quantity), 0) from return_lines rl join returns r on r.id = rl.return_id where r.order_id = ${qualified(orders.id)})`;

async function moneyState(db: Db, id: number) {
	const [row] = await db
		.select({
			code: orders.code,
			status: orders.status,
			subtotal: orders.subtotal,
			discount: orders.discount,
			shipping: orders.shipping,
			paymentMethod: orders.paymentMethod,
			paid: paidSum("payment"),
			refunded: paidSum("refund"),
			returnedUnits: returnedUnitsOfOrder,
		})
		.from(orders)
		.where(eq(orders.id, id));
	if (!row) return null;
	const lines = await db
		.select({
			quantity: orderItems.quantity,
			unitPrice: orderItems.unitPrice,
			returned: returnedOfLine,
		})
		.from(orderItems)
		.where(eq(orderItems.orderId, id));
	const summary = paymentSummary(
		amountOwed({ ...row, lines }),
		row.paid,
		row.refunded,
	);
	const unchanged = db
		.select({ id: orders.id })
		.from(orders)
		.where(
			and(
				eq(orders.id, id),
				eq(orders.status, row.status),
				sql`${paidSum("payment")} = ${row.paid}`,
				sql`${paidSum("refund")} = ${row.refunded}`,
				sql`${returnedUnitsOfOrder} = ${row.returnedUnits}`,
			),
		);
	return { row, summary, unchanged };
}

async function soldLots(db: Db, orderId: number): Promise<SoldLot[]> {
	const [sales, returned] = await Promise.all([
		db
			.select({
				orderItemId: inventoryMovements.orderItemId,
				lotId: inventoryMovements.lotId,
				sold: sql<number>`-sum(${inventoryMovements.quantity})`,
			})
			.from(inventoryMovements)
			.innerJoin(orderItems, eq(orderItems.id, inventoryMovements.orderItemId))
			.innerJoin(lots, eq(lots.id, inventoryMovements.lotId))
			.where(
				and(
					eq(orderItems.orderId, orderId),
					eq(inventoryMovements.kind, "sale"),
				),
			)
			.groupBy(inventoryMovements.orderItemId, inventoryMovements.lotId),
		db
			.select({
				orderItemId: returnLines.orderItemId,
				lotId: returnLines.lotId,
				quantity: sql<number>`sum(${returnLines.quantity})`,
			})
			.from(returnLines)
			.innerJoin(returns, eq(returns.id, returnLines.returnId))
			.where(eq(returns.orderId, orderId))
			.groupBy(returnLines.orderItemId, returnLines.lotId),
	]);
	return sales.map((s) => {
		if (s.orderItemId === null) throw new Error("Sale movement without line");
		return {
			orderItemId: s.orderItemId,
			lotId: s.lotId,
			sold: s.sold,
			returned:
				returned.find(
					(r) => r.orderItemId === s.orderItemId && r.lotId === s.lotId,
				)?.quantity ?? 0,
		};
	});
}

// A batch runs alone in one transaction, so inside it the newest return of the order is
// this one, and each line's id is the last inserted row when its movements are written.
function returnStatements(
	db: Db,
	orderId: number,
	header: { reason: (typeof RETURN_REASONS)[number]; note: string | null },
	plan: ReturnLinePlan[],
	actor: string,
	guard: SQLWrapper,
) {
	const returnId = sql<number>`(select max(id) from returns where order_id = ${orderId})`;
	return {
		header: insertIfExists(
			db,
			returns,
			{ orderId, ...header, createdBy: actor },
			guard,
		).returning({ id: returns.id }),
		lines: plan.flatMap((line) => {
			const [back, waste] = returnMovements(line);
			if (!back) throw new Error("A return line needs a movement");
			return [
				insertIfExists(db, returnLines, { returnId, ...line }, guard),
				insertIfExists(
					db,
					inventoryMovements,
					{
						...back,
						returnLineId: sql<number>`last_insert_rowid()`,
						createdBy: actor,
					},
					guard,
				),
				...(waste
					? [
							insertIfExists(
								db,
								inventoryMovements,
								{
									...waste,
									returnLineId: sql<number>`(select return_line_id from inventory_movements where id = last_insert_rowid())`,
									createdBy: actor,
								},
								guard,
							),
						]
					: []),
			];
		}),
	};
}

const shipInput = z.object({
	courier: z.string().trim().min(1).max(80),
	trackingCode: z.string().trim().min(1).max(80).optional(),
});

const cancelInput = z.object({
	reason: z.string().trim().min(1).max(200),
});

const markPaidInput = z.object({
	reference: z.string().trim().min(1).max(120).optional(),
});

// Conditioned on the status read, so a concurrent change makes it a no-op; triggers check the rest.
function statusUpdate(
	db: Db,
	id: number,
	from: OrderStatus,
	set: SQLiteUpdateSetSource<typeof orders>,
) {
	return db
		.update(orders)
		.set(set)
		.where(and(eq(orders.id, id), eq(orders.status, from)));
}

export const ordersRouter = new Hono<AdminEnv>()
	.get("/", validate("query", orderListSearch), async (c) => {
		const settings = await getSettings(getDb());
		return c.json(
			await pagedOrders(getDb(), settings.timeZone, c.req.valid("query")),
		);
	})
	// Triggers put the units back and release the coupon; running it again changes nothing.
	.post("/expire-pending", async (c) => {
		const db = getDb();
		const actor = c.var.adminUserId;
		const overdue = db
			.select({ id: orderFollowups.orderId })
			.from(orderFollowups)
			.where(eq(orderFollowups.action, "collect_payment"));
		const [, cancelled] = await db.batch([
			audit(db, {
				actorUserId: actor,
				action: "order.status",
				entityType: "order",
				entityId: 0,
				data: {
					from: "pending",
					to: "cancelled",
					reason: "payment_deadline",
					orders: sql`(select json_group_array(order_id) from order_followups where action = 'collect_payment')`,
				},
			}),
			db
				.update(orders)
				.set({
					status: "cancelled",
					cancelledAt: now,
					cancelledBy: actor,
					cancelReason: "payment_deadline",
				})
				.where(
					and(
						eq(orders.status, "pending"),
						inArray(orders.id, overdue),
						sql`${paidSum("payment")} = 0`,
					),
				)
				.returning({ id: orders.id, code: orders.code }),
		]);
		return c.json({ cancelled });
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const detail = await orderDetail(db, id);
		if (!detail) return c.json({ error: "not_found" }, 404);
		const costs = seesCosts(c);
		return c.json({
			...detail,
			movements: detail.movements.map((m) => ({
				...m,
				unitCost: costs ? m.unitCost : null,
			})),
			cost: costs ? detail.cost : null,
		});
	})
	.post(
		"/:id/mark-paid",
		validate("param", idParam),
		validate("json", markPaidInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { reference } = c.req.valid("json");
			const actor = c.var.adminUserId;
			const state = await moneyState(db, id);
			if (!state) return c.json({ error: "not_found" }, 404);
			const { row, summary, unchanged } = state;
			if (!["pending", "paid", "shipped"].includes(row.status))
				return invalidTransition(c, "mark-paid");
			if (summary.balance <= 0) return invalidTransition(c, "mark-paid");
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "payment.create",
						entityType: "payment",
						entityId: nextId(payments),
						data: {
							orderId: id,
							kind: "payment",
							amount: summary.balance,
							method: row.paymentMethod,
						},
					},
					unchanged,
				),
				insertIfExists(
					db,
					payments,
					{
						orderId: id,
						kind: "payment",
						method: row.paymentMethod,
						amount: summary.balance,
						status: "confirmed",
						reference: reference ?? null,
						recordedBy: actor,
					},
					unchanged,
				),
				...(row.status === "pending"
					? [
							statusUpdate(db, id, "pending", { status: "paid", paidAt: now }),
							audit(
								db,
								{
									actorUserId: actor,
									action: "order.status",
									entityType: "order",
									entityId: id,
									data: { from: "pending", to: "paid" },
								},
								db
									.select({ id: orders.id })
									.from(orders)
									.where(and(eq(orders.id, id), eq(orders.status, "paid"))),
							),
						]
					: []),
			]);
			if (!results[1].meta.changes) return invalidTransition(c, "mark-paid");
			return c.json({ ok: true, amount: summary.balance });
		},
	)
	.post(
		"/:id/refunds",
		validate("param", idParam),
		validate("json", refundInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const state = await moneyState(db, id);
			if (!state) return c.json({ error: "not_found" }, 404);
			const { summary, unchanged } = state;
			if (input.returnId) {
				const ret = await db.query.returns.findFirst({
					where: and(eq(returns.id, input.returnId), eq(returns.orderId, id)),
				});
				if (!ret) return c.json({ error: "not_found" }, 404);
			}
			if (input.amount > summary.refundable)
				return c.json(
					{
						error: "refund_exceeds_refundable",
						refundable: summary.refundable,
					},
					409,
				);
			const [, refund] = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "payment.create",
						entityType: "payment",
						entityId: nextId(payments),
						data: { orderId: id, kind: "refund", ...input },
					},
					unchanged,
				),
				insertIfExists(
					db,
					payments,
					{
						orderId: id,
						kind: "refund",
						method: input.method,
						amount: input.amount,
						status: "confirmed",
						reference: input.reference ?? null,
						returnId: input.returnId ?? null,
						recordedBy: actor,
					},
					unchanged,
				),
			]);
			if (!refund.meta.changes) return invalidTransition(c, "refund");
			return c.json({ ok: true }, 201);
		},
	)
	.post(
		"/:id/ship",
		validate("param", idParam),
		validate("json", shipInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			if (!canTransition(order.status, "shipped", order.paymentMethod))
				return invalidTransition(c, "ship");
			const results = await db.batch([
				statusUpdate(db, id, order.status, {
					status: "shipped",
					shippedAt: now,
					courier: input.courier,
					trackingCode: input.trackingCode ?? null,
				}),
				audit(db, {
					actorUserId: actor,
					action: "order.status",
					entityType: "order",
					entityId: id,
					data: { from: order.status, to: "shipped", ...input },
				}),
			]);
			if (!results[0].meta.changes) return invalidTransition(c, "ship");
			return c.json({ ok: true });
		},
	)
	.post("/:id/deliver", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const actor = c.var.adminUserId;
		const state = await moneyState(db, id);
		if (!state) return c.json({ error: "not_found" }, 404);
		if (state.row.status !== "shipped") return invalidTransition(c, "deliver");
		if (state.summary.balance > 0)
			return c.json(
				{ error: "order_not_paid" as const, balance: state.summary.balance },
				409,
			);
		const results = await db.batch([
			statusUpdate(db, id, "shipped", {
				status: "delivered",
				deliveredAt: now,
			}),
			audit(db, {
				actorUserId: actor,
				action: "order.status",
				entityType: "order",
				entityId: id,
				data: { from: "shipped", to: "delivered" },
			}),
		]);
		if (!results[0].meta.changes) return invalidTransition(c, "deliver");
		return c.json({ ok: true });
	})
	// Triggers put every unit back in its lot and free the coupon.
	.post(
		"/:id/cancel",
		validate("param", idParam),
		validate("json", cancelInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { reason } = c.req.valid("json");
			const actor = c.var.adminUserId;
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			if (!canTransition(order.status, "cancelled", order.paymentMethod))
				return invalidTransition(c, "cancel");
			const results = await db.batch([
				statusUpdate(db, id, order.status, {
					status: "cancelled",
					cancelledAt: now,
					cancelledBy: actor,
					cancelReason: reason,
				}),
				audit(db, {
					actorUserId: actor,
					action: "order.status",
					entityType: "order",
					entityId: id,
					data: { from: order.status, to: "cancelled", reason },
				}),
			]);
			if (!results[0].meta.changes) return invalidTransition(c, "cancel");
			return c.json({ ok: true });
		},
	)
	.post(
		"/:id/returns",
		validate("param", idParam),
		validate("json", returnInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			if (!(SHIPPED_STATUSES as readonly string[]).includes(order.status))
				return invalidTransition(c, "return");
			let plan: ReturnLinePlan[];
			try {
				plan = planReturn(await soldLots(db, id), input.lines);
			} catch (e) {
				if (e instanceof ReturnExceedsSoldError)
					return c.json(
						{ error: "return_exceeds_sold", orderItemId: e.orderItemId },
						409,
					);
				if (e instanceof ReturnLotRequiredError)
					return c.json(
						{ error: "return_lot_required", orderItemId: e.orderItemId },
						400,
					);
				throw e;
			}
			const stillAsRead = db
				.select({ id: orders.id })
				.from(orders)
				.where(and(eq(orders.id, id), eq(orders.status, order.status)));
			const { header, lines } = returnStatements(
				db,
				id,
				{ reason: input.reason, note: input.note ?? null },
				plan,
				actor,
				stillAsRead,
			);
			// The audit row goes first: the return gets the next id.
			const [, inserted] = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "return.create",
						entityType: "return",
						entityId: nextId(returns),
						data: { orderId: id, reason: input.reason, lines: plan },
					},
					stillAsRead,
				),
				header,
				...lines,
			]);
			const [created] = inserted;
			if (!created) return invalidTransition(c, "return");
			return c.json({ ok: true, returnId: created.id }, 201);
		},
	);
