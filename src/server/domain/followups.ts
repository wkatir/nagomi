import { desc, eq } from "drizzle-orm";
import { integer, real, sqliteView, text } from "drizzle-orm/sqlite-core";
import { type Db, schema } from "#/db";
import { ORDER_STATUSES } from "#/lib/enums";

const { customers, orders } = schema;

export const orderFollowups = sqliteView("order_followups", {
	orderId: integer("order_id").notNull(),
	status: text("status", { enum: ORDER_STATUSES }).notNull(),
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
			customerEmail: customers.email,
			customerPhone: orders.customerPhone,
			status: orderFollowups.status,
			since: orderFollowups.since,
			deadlineHours: orderFollowups.deadlineHours,
			dueAt: orderFollowups.dueAt,
			hoursOverdue: orderFollowups.hoursOverdue,
		})
		.from(orderFollowups)
		.innerJoin(orders, eq(orders.id, orderFollowups.orderId))
		.leftJoin(customers, eq(customers.id, orders.customerId))
		.orderBy(desc(orderFollowups.hoursOverdue), desc(orders.id));
}
