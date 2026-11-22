import type { ShippingMethod } from "#/db/schema";

export type Zone = {
	method: ShippingMethod;
	fee: number;
	deliveryDaysMin: number;
	deliveryDaysMax: number;
};

// `merchandise` is the subtotal minus the discount; a null `freeFrom` is never free.
export function zoneFee(
	zone: Zone,
	merchandise: number,
	freeFrom: number | null,
): number {
	if (!Number.isSafeInteger(merchandise) || merchandise < 0)
		throw new Error(`Invalid merchandise total ${merchandise}`);
	return freeFrom !== null && merchandise >= freeFrom ? 0 : zone.fee;
}

export type ZoneCoverage<Z> = {
	zone: Z;
	coversRest: boolean;
	municipalities: string[];
};

export function zoneForMunicipality<Z>(
	zones: ZoneCoverage<Z>[],
	municipality: string,
): Z | null {
	const listed = zones.find((z) => z.municipalities.includes(municipality));
	if (listed) return listed.zone;
	return zones.find((z) => z.coversRest)?.zone ?? null;
}
