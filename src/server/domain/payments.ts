import type { OrderPaymentStatus, OrderStatus } from "#/db/schema";

export type OwedLine = {
	quantity: number;
	unitPrice: number;
	returned: number;
};

const safe = (...amounts: number[]) => {
	if (!amounts.every((n) => Number.isSafeInteger(n) && n >= 0))
		throw new Error(`Invalid amounts ${amounts.join("/")}`);
};

// The discount is prorated by the kept value, rounded half up. A full return owes nothing,
// so it refunds the shipping too.
export function amountOwed(order: {
	status: OrderStatus;
	subtotal: number;
	discount: number;
	shipping: number;
	lines: OwedLine[];
}): number {
	safe(order.subtotal, order.discount, order.shipping);
	if (order.status === "cancelled") return 0;
	const kept = order.lines.reduce((n, l) => {
		safe(l.quantity, l.unitPrice, l.returned);
		if (l.returned > l.quantity)
			throw new Error(`Returned ${l.returned} of ${l.quantity}`);
		return n + (l.quantity - l.returned) * l.unitPrice;
	}, 0);
	if (kept === 0) return 0;
	const discount =
		order.subtotal === 0
			? 0
			: Math.floor(
					(2 * order.discount * kept + order.subtotal) / (2 * order.subtotal),
				);
	return kept - discount + order.shipping;
}

export type PaymentSummary = {
	owed: number;
	paid: number;
	refunded: number;
	net: number;
	// Negative when the store owes a refund.
	balance: number;
	refundable: number;
	status: OrderPaymentStatus;
};

// The payment status is never stored, so it cannot drift from the money recorded.
export function paymentSummary(
	owed: number,
	paid: number,
	refunded: number,
): PaymentSummary {
	safe(owed, paid, refunded);
	if (refunded > paid)
		throw new Error(`Refunded ${refunded} exceeds paid ${paid}`);
	const net = paid - refunded;
	const balance = owed - net;
	const status: OrderPaymentStatus =
		balance < 0
			? "refund_due"
			: balance > 0
				? net === 0
					? "unpaid"
					: "partially_paid"
				: owed > 0
					? "paid"
					: paid > 0
						? "refunded"
						: "nothing_due";
	return {
		owed,
		paid,
		refunded,
		net,
		balance,
		refundable: Math.max(0, -balance),
		status,
	};
}

export function paidAt(
	total: number,
	confirmedPayments: { amount: number; recordedAt: string }[],
): string | null {
	safe(total);
	if (total === 0) return null;
	let sum = 0;
	for (const p of [...confirmedPayments].sort((a, b) =>
		a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0,
	)) {
		safe(p.amount);
		sum += p.amount;
		if (sum >= total) return p.recordedAt;
	}
	return null;
}
