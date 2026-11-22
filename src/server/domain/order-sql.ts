import { type SQL, sql } from "drizzle-orm";
import { type OrderPaymentStatus, orderItems, orders } from "#/db/schema";
import { qualified } from "./d1";

export const paidSum = (
	kind: "payment" | "refund",
	order: SQL = qualified(orders.id),
) =>
	sql<number>`(select coalesce(sum(p.amount), 0) from payments p where p.order_id = ${order} and p.kind = ${kind} and p.status = 'confirmed')`;

const returnedUnits = (orderItem: SQL) =>
	sql<number>`(select coalesce(sum(rl.quantity), 0) from return_lines rl where rl.order_item_id = ${orderItem})`;
export const returnedOfLine = returnedUnits(qualified(orderItems.id));

export const keptValue = (orderId: SQL) =>
	sql<number>`(select coalesce(sum((oi.quantity - ${returnedUnits(sql.raw("oi.id"))}) * oi.unit_price), 0) from order_items oi where oi.order_id = ${orderId})`;

// amountOwed (payments.ts) in SQL; must stay in step with it.
export const owedOf = (row: string) =>
	sql.raw(`case when ${row}.status = 'cancelled' or ${row}.kept = 0 then 0
				else ${row}.kept
					- (case when ${row}.subtotal = 0 then 0 else (2 * ${row}.discount * ${row}.kept + ${row}.subtotal) / (2 * ${row}.subtotal) end)
					+ ${row}.shipping end`);

// paymentSummary (payments.ts) in SQL, so lists can filter by it; order-sql.test.ts checks both agree.
export const paymentStatusIs = (status: OrderPaymentStatus) => {
	const id = sql.raw("o.id");
	return sql`${orders.id} in (
	select t.id from (
		select s.id,
			${owedOf("s")} as owed,
			s.paid as paid,
			s.paid - s.refunded as net
		from (
			select o.id, o.status, o.subtotal, o.discount, o.shipping,
				${keptValue(id)} as kept,
				${paidSum("payment", id)} as paid,
				${paidSum("refund", id)} as refunded
			from orders o
		) s
	) t
	where (case
		when t.owed - t.net < 0 then 'refund_due'
		when t.owed - t.net > 0 then (case when t.net = 0 then 'unpaid' else 'partially_paid' end)
		when t.owed > 0 then 'paid'
		when t.paid > 0 then 'refunded'
		else 'nothing_due' end) = ${status}
)`;
};

// Not the discount reason: an admin may confirm the order with another discount and its
// own reason.
export const promotionCodeOfOrder = sql<
	string | null
>`(select pr.code from promotions pr where pr.id = ${qualified(orders.promotionId)})`;
