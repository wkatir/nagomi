// Shipping is split by line value (by quantity when every line is free) with the
// largest-remainder method, so the shares add up exactly. Costs are `_e4` (1/10,000 of a
// currency unit), so a unit cost is at most half a hundredth of a cent off the invoice.

const E4_PER_MINOR = 100;

export type ReceiptLine = { quantity: number; unitCost: number };
export type LandedLine = { allocatedShippingE4: number; unitCostE4: number };

export function allocateLandedCost(
	lines: ReceiptLine[],
	shippingCost: number,
): LandedLine[] {
	if (!Number.isSafeInteger(shippingCost) || shippingCost < 0)
		throw new Error(`Invalid shipping cost ${shippingCost}`);
	for (const l of lines)
		if (
			!Number.isSafeInteger(l.quantity) ||
			l.quantity <= 0 ||
			!Number.isSafeInteger(l.unitCost) ||
			l.unitCost < 0
		)
			throw new Error(`Invalid receipt line ${JSON.stringify(l)}`);
	if (lines.length === 0) throw new Error("A receipt needs at least one line");

	const byValue = lines.some((l) => l.unitCost > 0);
	const weights = lines.map(
		(l) => BigInt(l.quantity) * BigInt(byValue ? l.unitCost : 1),
	);
	const totalWeight = weights.reduce((a, b) => a + b, 0n);
	const shipping = BigInt(shippingCost * E4_PER_MINOR);
	const shares = weights.map((w, index) => ({
		index,
		base: (shipping * w) / totalWeight,
		remainder: (shipping * w) % totalWeight,
	}));
	let left = shipping - shares.reduce((a, s) => a + s.base, 0n);
	for (const s of [...shares].sort((a, b) =>
		a.remainder === b.remainder
			? a.index - b.index
			: a.remainder > b.remainder
				? -1
				: 1,
	)) {
		if (left === 0n) break;
		s.base += 1n;
		left -= 1n;
	}

	return lines.map((l, i) => {
		const allocated = shares[i].base;
		const quantity = BigInt(l.quantity);
		const landed = BigInt(l.unitCost * E4_PER_MINOR) * quantity + allocated;
		return {
			allocatedShippingE4: Number(allocated),
			unitCostE4: Number((landed * 2n + quantity) / (2n * quantity)),
		};
	});
}

// Half away from zero.
export const e4ToMinor = (amount: number) =>
	Math.sign(amount) * Math.round(Math.abs(amount) / E4_PER_MINOR);

export type OrderedItem = { id: number; ordered: number; received: number };

export class ReceiptExceedsOrderedError extends Error {
	constructor(
		readonly purchaseOrderItemId: number,
		readonly remaining: number,
	) {
		super(
			`Purchase order item ${purchaseOrderItemId} has ${remaining} units left to receive`,
		);
	}
}

// The receipt_exceeds_ordered trigger enforces the same limit in SQL.
export function receiptOutcome(
	items: OrderedItem[],
	incoming: { purchaseOrderItemId: number; quantity: number }[],
): "partially_received" | "received" {
	const after = new Map(items.map((i) => [i.id, i.received]));
	for (const line of incoming) {
		const received = after.get(line.purchaseOrderItemId);
		if (received === undefined)
			throw new Error(
				`Item ${line.purchaseOrderItemId} is not in the purchase order`,
			);
		after.set(line.purchaseOrderItemId, received + line.quantity);
	}
	let complete = true;
	for (const item of items) {
		const received = after.get(item.id);
		if (received === undefined)
			throw new Error(`Purchase order item ${item.id} has no received count`);
		if (received > item.ordered)
			throw new ReceiptExceedsOrderedError(
				item.id,
				item.ordered - item.received,
			);
		if (received !== item.ordered) complete = false;
	}
	return complete ? "received" : "partially_received";
}

export type ReceiptDateProblem =
	| "received_on_in_future"
	| "received_before_ordered";

export function receiptDateProblem(input: {
	receivedOn: string;
	orderedOn: string | null;
	today: string;
}): ReceiptDateProblem | null {
	if (input.receivedOn > input.today) return "received_on_in_future";
	if (input.orderedOn !== null && input.receivedOn < input.orderedOn)
		return "received_before_ordered";
	return null;
}
