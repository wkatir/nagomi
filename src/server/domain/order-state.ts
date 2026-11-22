import type { OrderStatus, PaymentMethod } from "#/db/schema";

// The same table is enforced in SQL by the orders_status_transition trigger
// (drizzle/0001_integrity_triggers.sql). A cash-on-delivery order is shipped before it is
// paid; its cash is recorded before it is marked delivered.
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	pending: ["paid", "shipped", "cancelled"],
	paid: ["shipped", "cancelled"],
	shipped: ["delivered"],
	delivered: [],
	cancelled: [],
};

export function canTransition(
	from: OrderStatus,
	to: OrderStatus,
	paymentMethod: PaymentMethod,
) {
	if (!ORDER_TRANSITIONS[from].includes(to)) return false;
	if (from === "pending" && to === "shipped")
		return paymentMethod === "cash_on_delivery";
	return true;
}

export const SHIPPED_STATUSES = [
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];
// Orders that count as sales: everything except cancelled.
export const SOLD_STATUSES = [
	"pending",
	"paid",
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];
// Payment confirmed or the goods on their way (cash on delivery).
export const COMMITTED_STATUSES = [
	"paid",
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];
