import { desc, eq } from "drizzle-orm";
import { integer, real, sqliteView, text } from "drizzle-orm/sqlite-core";
import { type Db, schema } from "#/db";
import { ORDER_STATUSES } from "#/lib/enums";

const { orders } = schema;

export const orderFollowups = sqliteView("order_followups", {
	orderId: integer("order_id").notNull(),
	status: text("status", { enum: ORDER_STATUSES }).notNull(),
	action: text("action", {
		enum: ["collect_payment", "ship", "confirm_delivery"],
	}).notNull(),
	since: text("since").notNull(),
	deadlineHours: integer("deadline_hours").notNull(),
	dueAt: text("due_at").notNull(),
	hoursOverdue: real("hours_overdue").notNull(),
}).existing();

export async function overdueOrders(db: Db) {
	return db
		.select({
			orderId: orderFollowups.orderId,
			code: orders.code,
			customerId: orders.customerId,
			customerName: orders.customerName,
			customerEmail: orders.customerEmail,
			customerPhone: orders.customerPhone,
			paymentMethod: orders.paymentMethod,
			total: orders.total,
			status: orderFollowups.status,
			action: orderFollowups.action,
			since: orderFollowups.since,
			deadlineHours: orderFollowups.deadlineHours,
			dueAt: orderFollowups.dueAt,
			hoursOverdue: orderFollowups.hoursOverdue,
		})
		.from(orderFollowups)
		.innerJoin(orders, eq(orders.id, orderFollowups.orderId))
		.orderBy(desc(orderFollowups.hoursOverdue), desc(orders.id));
}
