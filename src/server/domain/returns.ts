import type { ReturnDisposition } from "#/db/schema";

export type SoldLot = {
	orderItemId: number;
	lotId: number;
	sold: number;
	returned: number;
};

export type ReturnRequest = {
	orderItemId: number;
	quantity: number;
	disposition: ReturnDisposition;
	// Required when the line left from more than one lot: the lot code is on the unit.
	lotId?: number;
};

export type ReturnLinePlan = {
	orderItemId: number;
	lotId: number;
	quantity: number;
	disposition: ReturnDisposition;
};

export class ReturnExceedsSoldError extends Error {
	constructor(
		readonly orderItemId: number,
		readonly lotId: number | undefined,
		readonly returnable: number,
	) {
		super(
			`Order item ${orderItemId}${lotId === undefined ? "" : ` lot ${lotId}`} has ${returnable} units left to return`,
		);
	}
}

export class ReturnLotRequiredError extends Error {
	constructor(readonly orderItemId: number) {
		super(`Order item ${orderItemId} left from several lots: choose the lot`);
	}
}

// The return_exceeds_sold trigger enforces the same limit in SQL.
export function planReturn(
	sold: SoldLot[],
	requests: ReturnRequest[],
): ReturnLinePlan[] {
	if (requests.length === 0)
		throw new Error("A return needs at least one line");
	const left = new Map(
		sold.map((s) => [`${s.orderItemId}:${s.lotId}`, s.sold - s.returned]),
	);
	const plan: ReturnLinePlan[] = [];
	for (const r of requests) {
		if (!Number.isSafeInteger(r.quantity) || r.quantity <= 0)
			throw new Error(`Invalid quantity ${r.quantity}`);
		const lots = sold.filter((s) => s.orderItemId === r.orderItemId);
		let lotId = r.lotId;
		if (lotId === undefined) {
			if (lots.length > 1) throw new ReturnLotRequiredError(r.orderItemId);
			lotId = lots[0]?.lotId;
		}
		if (lotId === undefined)
			throw new ReturnExceedsSoldError(r.orderItemId, undefined, 0);
		const key = `${r.orderItemId}:${lotId}`;
		const returnable = left.get(key) ?? 0;
		if (r.quantity > returnable)
			throw new ReturnExceedsSoldError(r.orderItemId, r.lotId, returnable);
		if (!sold.some((s) => s.orderItemId === r.orderItemId && s.lotId === lotId))
			throw new Error(
				`Order item ${r.orderItemId} has no sale from lot ${lotId}`,
			);
		left.set(key, returnable - r.quantity);
		const same = plan.find(
			(p) =>
				p.orderItemId === r.orderItemId &&
				p.lotId === lotId &&
				p.disposition === r.disposition,
		);
		if (same) same.quantity += r.quantity;
		else
			plan.push({
				orderItemId: r.orderItemId,
				lotId,
				quantity: r.quantity,
				disposition: r.disposition,
			});
	}
	return plan;
}

export function fullReturn(sold: SoldLot[]): ReturnLinePlan[] {
	return sold
		.filter((s) => s.sold > s.returned)
		.map((s) => ({
			orderItemId: s.orderItemId,
			lotId: s.lotId,
			quantity: s.sold - s.returned,
			disposition: "restock" as const,
		}));
}

// A written-off unit comes back into its lot and leaves again as waste, so the ledger shows it.
export function returnMovements(line: ReturnLinePlan) {
	const back = {
		lotId: line.lotId,
		kind: "return" as const,
		quantity: line.quantity,
		reason: null,
	};
	return line.disposition === "restock"
		? [back]
		: [
				back,
				{
					lotId: line.lotId,
					kind: "waste" as const,
					quantity: -line.quantity,
					reason: "customer_return" as const,
				},
			];
}
