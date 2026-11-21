import type { OrderStatus } from "#/db/schema";

// The same table is enforced in SQL by the orders_status_transition trigger
// (drizzle/0001_integrity_triggers.sql). fulfilled -> cancelled is a failed delivery: a
// return restocks every unit to its lot. Returns of delivered orders keep the status.
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	pending: ["confirmed", "cancelled"],
	confirmed: ["fulfilled", "cancelled"],
	fulfilled: ["delivered", "cancelled"],
	delivered: [],
	cancelled: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) =>
	ORDER_TRANSITIONS[from].includes(to);

export const SHIPPED_STATUSES = [
	"fulfilled",
	"delivered",
] as const satisfies readonly OrderStatus[];
export const SOLD_STATUSES = [
	"confirmed",
	"fulfilled",
	"delivered",
] as const satisfies readonly OrderStatus[];
