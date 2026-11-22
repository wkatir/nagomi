// A size is sold only from units the store has. An order takes its units from the lots when
// it is placed and a cancellation puts them back, so the units on hand are the units for
// sale.

export type StockAvailability = "in_stock" | "sold_out";

export const sellableUnits = (onHand: number) => Math.max(0, onHand);

// Capped so the exact stock above the limit per line is not published.
export const lineMax = (sellable: number, maxPerLine: number) =>
	Math.min(sellable, maxPerLine);

export const unitsAvailability = (sellable: number): StockAvailability =>
	sellable > 0 ? "in_stock" : "sold_out";
