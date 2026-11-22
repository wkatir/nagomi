import type { OrderStatus, PaymentMethod } from "#/db/schema";

// Mirrors the orders_status_transition trigger. Cash on delivery ships before it is paid.
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
export const SOLD_STATUSES = [
	"pending",
	"paid",
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];
export const COMMITTED_STATUSES = [
	"paid",
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];
