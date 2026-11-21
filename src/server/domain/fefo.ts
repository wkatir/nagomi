export type LotStock = { lotId: number; expiresOn: string; available: number };
export type Allocation = { lotId: number; quantity: number };

// `today` is the store's local date (localDate in src/lib/dates.ts), the calendar lots
// store their expiry in.
export const isExpired = (expiresOn: string, today: string) =>
	expiresOn < today;

// Throws on insufficient stock so an order is never fulfilled partially without someone
// deciding it.
export function allocateFefo(
	lots: LotStock[],
	quantity: number,
	today: string,
): Allocation[] {
	if (!Number.isInteger(quantity) || quantity <= 0)
		throw new Error(`Invalid quantity ${quantity}`);
	const ordered = lots
		.filter((l) => l.available > 0 && !isExpired(l.expiresOn, today))
		.sort(
			(a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.lotId - b.lotId,
		);
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
