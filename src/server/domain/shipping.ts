import type { ShippingMethod } from "#/db/schema";

export type Zone = {
	method: ShippingMethod;
	fee: number;
	freeFrom: number | null;
	deliveryDaysMin: number;
	deliveryDaysMax: number;
};

// `merchandise` is the subtotal minus the discount.
export function zoneFee(zone: Zone, merchandise: number): number {
	if (!Number.isSafeInteger(merchandise) || merchandise < 0)
		throw new Error(`Invalid merchandise total ${merchandise}`);
	return zone.freeFrom !== null && merchandise >= zone.freeFrom ? 0 : zone.fee;
}

// The storefront advertises "free shipping from" only when every active delivery zone
// waives the fee from the same amount.
export function storeFreeShippingFrom(
	zones: Pick<Zone, "method" | "freeFrom">[],
): number | null {
	const delivery = zones.filter((z) => z.method !== "pickup");
	const first = delivery[0];
	if (!first || first.freeFrom === null) return null;
	return delivery.every((z) => z.freeFrom === first.freeFrom)
		? first.freeFrom
		: null;
}
