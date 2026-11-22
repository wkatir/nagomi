export type StockAvailability = "in_stock" | "sold_out";

export const sellableUnits = (onHand: number) => Math.max(0, onHand);

// Capped so the exact stock above the limit per line is not published.
export const lineMax = (sellable: number, maxPerLine: number) =>
	Math.min(sellable, maxPerLine);

export const unitsAvailability = (sellable: number): StockAvailability =>
	sellable > 0 ? "in_stock" : "sold_out";
