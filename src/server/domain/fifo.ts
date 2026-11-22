export type LotStock = { lotId: number; available: number };
export type Allocation = { lotId: number; quantity: number };

// Throws on insufficient stock so an order is never fulfilled partially without someone
// deciding it.
export function allocateFifo(lots: LotStock[], quantity: number): Allocation[] {
	if (!Number.isInteger(quantity) || quantity <= 0)
		throw new Error(`Invalid quantity ${quantity}`);
	const ordered = lots
		.filter((l) => l.available > 0)
		.sort((a, b) => a.lotId - b.lotId);
	const out: Allocation[] = [];
	let remaining = quantity;
	for (const lot of ordered) {
		if (remaining === 0) break;
		const take = Math.min(lot.available, remaining);
		out.push({ lotId: lot.lotId, quantity: take });
		remaining -= take;
	}
	if (remaining > 0)
		throw new InsufficientStockError(quantity - remaining, quantity);
	return out;
}

export class InsufficientStockError extends Error {
	constructor(
		readonly available: number,
		readonly requested: number,
	) {
		super(`Insufficient stock: ${available} available, ${requested} requested`);
	}
}
