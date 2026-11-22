import type { CheckoutPaymentMethod } from "#/lib/enums";
import type { CardProvider } from "../payments/demo-card";

const minor = (n: number, what: string) => {
	if (!Number.isSafeInteger(n) || n < 0)
		throw new Error(`Invalid ${what} ${n}`);
};

// Prices include IVA: tax = total - total / (1 + rate), rounded half up (1300 bp = 13 %).
export function includedTax(total: number, rateBp: number): number {
	minor(total, "total");
	minor(rateBp, "tax rate");
	return Math.floor(
		(2 * total * rateBp + (10000 + rateBp)) / (2 * (10000 + rateBp)),
	);
}

export class BundleAllocationError extends Error {
	constructor(readonly price: number) {
		super(`A set price of ${price} cannot be split into whole unit prices`);
	}
}

// Splits a set's price by list price so the lines add up to it exactly and returns refund
// a fair share; the rounding remainder goes to the first single unit.
export function allocateBundle(
	price: number,
	items: { quantity: number; listPrice: number }[],
): number[] {
	minor(price, "set price");
	const listTotal = items.reduce((n, i) => {
		minor(i.listPrice, "list price");
		if (!Number.isInteger(i.quantity) || i.quantity <= 0)
			throw new Error(`Invalid set quantity ${i.quantity}`);
		return n + i.quantity * i.listPrice;
	}, 0);
	if (listTotal === 0) throw new BundleAllocationError(price);
	const unit = items.map((i) => Math.floor((price * i.listPrice) / listTotal));
	const allocated = unit.reduce((n, u, k) => n + u * items[k].quantity, 0);
	const remainder = price - allocated;
	if (remainder === 0) return unit;
	const single = items.findIndex((i) => i.quantity === 1);
	if (single < 0) throw new BundleAllocationError(price);
	return unit.map((u, k) => (k === single ? u + remainder : u));
}

export type CartTotals = {
	subtotal: number;
	discount: number;
	shipping: number | null;
	total: number;
	taxIncluded: number;
};

// `shipping` is null until the delivery municipality is known.
export function cartTotals(input: {
	subtotal: number;
	discount: number;
	shipping: number | null;
	taxRateBp: number;
}): CartTotals {
	minor(input.subtotal, "subtotal");
	minor(input.discount, "discount");
	if (input.discount > input.subtotal)
		throw new Error(`Discount ${input.discount} above ${input.subtotal}`);
	if (input.shipping !== null) minor(input.shipping, "shipping");
	const total = input.subtotal - input.discount + (input.shipping ?? 0);
	return {
		subtotal: input.subtotal,
		discount: input.discount,
		shipping: input.shipping,
		total,
		taxIncluded: includedTax(total, input.taxRateBp),
	};
}

export type PaymentUnavailableReason =
	| "not_configured"
	| "outside_zone"
	| "over_max_total"
	| "address_required";

export type PaymentOption = {
	method: CheckoutPaymentMethod;
	available: boolean;
	reason: PaymentUnavailableReason | null;
	maxTotal: number | null;
	zone: string | null;
	provider: CardProvider | null;
};

export function paymentOptions(
	accepted: {
		method: string;
		maxTotal: number | null;
		shippingZoneId: number | null;
		shippingZoneSlug: string | null;
	}[],
	order: {
		total: number;
		zoneId: number | null;
		cardProvider: CardProvider | null;
		bankConfigured: boolean;
	},
): PaymentOption[] {
	const online: readonly string[] = [
		"card",
		"bank_transfer",
		"cash_on_delivery",
	];
	return accepted
		.filter((a) => online.includes(a.method))
		.map((a) => {
			const method = a.method as CheckoutPaymentMethod;
			const reason: PaymentUnavailableReason | null =
				(method === "card" && order.cardProvider === null) ||
				(method === "bank_transfer" && !order.bankConfigured)
					? "not_configured"
					: a.shippingZoneId !== null && order.zoneId === null
						? "address_required"
						: a.shippingZoneId !== null && a.shippingZoneId !== order.zoneId
							? "outside_zone"
							: a.maxTotal !== null && order.total > a.maxTotal
								? "over_max_total"
								: null;
			return {
				method,
				available: reason === null,
				reason,
				maxTotal: a.maxTotal,
				zone: a.shippingZoneSlug,
				provider: method === "card" ? order.cardProvider : null,
			};
		});
}

export type LotBalance = {
	lotId: number;
	variantId: number;
	available: number;
};
export type LineDemand = { key: string; variantId: number; quantity: number };

export class OutOfStockError extends Error {
	constructor(readonly variantId: number) {
		super(`Not enough stock of variant ${variantId}`);
	}
}

// FIFO across the whole order: a size alone and inside a set draw from the same lots.
export function allocateLines(lots: LotBalance[], lines: LineDemand[]) {
	const left = new Map(
		[...lots].sort((a, b) => a.lotId - b.lotId).map((l) => [l.lotId, { ...l }]),
	);
	return lines.map((line) => {
		let remaining = line.quantity;
		const taken: { lotId: number; quantity: number }[] = [];
		for (const lot of left.values()) {
			if (remaining === 0) break;
			if (lot.variantId !== line.variantId || lot.available <= 0) continue;
			const take = Math.min(lot.available, remaining);
			lot.available -= take;
			remaining -= take;
			taken.push({ lotId: lot.lotId, quantity: take });
		}
		if (remaining > 0) throw new OutOfStockError(line.variantId);
		return { key: line.key, taken };
	});
}
