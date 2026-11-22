import { and, eq, sql } from "drizzle-orm";
import { type Db, schema } from "#/db";
import type { CardProvider } from "../payments/demo-card";
import { mapDbError } from "./db-errors";
import { paidSum } from "./order-sql";

const { orders, payments } = schema;

export type CardResult = {
	orderCode: string;
	transactionId: string;
	approved: boolean;
	amount: number;
	reference: string;
	provider: CardProvider;
};

export type CardRecordOutcome =
	| { ok: true; duplicate: boolean; approved: boolean }
	| { ok: false; error: "order_not_found" | "amount_mismatch" };

const isDuplicate = (e: unknown) =>
	mapDbError(e) === null &&
	/UNIQUE constraint failed: payments/.test(String(e));

export async function recordCardPayment(
	db: Db,
	result: CardResult,
): Promise<CardRecordOutcome> {
	const seen = await db.query.payments.findFirst({
		columns: { status: true },
		where: eq(payments.providerTransactionId, result.transactionId),
	});
	if (seen)
		return { ok: true, duplicate: true, approved: seen.status === "confirmed" };
	const order = await db.query.orders.findFirst({
		where: eq(orders.code, result.orderCode),
	});
	if (!order) return { ok: false, error: "order_not_found" };
	if (order.paymentMethod !== "card" || result.amount !== order.total)
		return { ok: false, error: "amount_mismatch" };
	try {
		if (!result.approved) {
			await db.insert(payments).values({
				orderId: order.id,
				kind: "payment",
				method: "card",
				amount: result.amount,
				status: "failed",
				reference: result.reference,
				providerTransactionId: result.transactionId,
				recordedBy: result.provider,
			});
			return { ok: true, duplicate: false, approved: false };
		}
		const pendingPayment = await db.query.payments.findFirst({
			where: and(
				eq(payments.orderId, order.id),
				eq(payments.method, "card"),
				eq(payments.status, "pending"),
				eq(payments.recordedBy, result.provider),
			),
		});
		await db.batch([
			pendingPayment
				? db
						.update(payments)
						.set({
							status: "confirmed",
							providerTransactionId: result.transactionId,
							reference: result.reference,
						})
						.where(
							and(
								eq(payments.id, pendingPayment.id),
								eq(payments.status, "pending"),
							),
						)
				: db.insert(payments).values({
						orderId: order.id,
						kind: "payment",
						method: "card",
						amount: result.amount,
						status: "confirmed",
						reference: result.reference,
						providerTransactionId: result.transactionId,
						recordedBy: result.provider,
					}),
			db
				.update(orders)
				.set({
					status: "paid",
					paidAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
				})
				.where(
					and(
						eq(orders.id, order.id),
						eq(orders.status, "pending"),
						sql`${paidSum("payment")} >= ${orders.total}`,
					),
				),
		]);
	} catch (e) {
		if (isDuplicate(e))
			return { ok: true, duplicate: true, approved: result.approved };
		throw e;
	}
	return { ok: true, duplicate: false, approved: true };
}
