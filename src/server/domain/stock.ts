import { addDays, startOfLocalDay } from "#/lib/dates";

// A size is sold only from units the store has: units in lots that have not expired, minus
// units promised to open orders. A confirmed order holds its units until it is fulfilled or
// cancelled; a pending order holds them until its confirmation deadline (consumer law:
// confirm by the next calendar day), so an order placed before yesterday no longer holds.

export type StockAvailability = "in_stock" | "sold_out";

// The dashboard flags pending orders placed before it as overdue.
export const pendingHoldStart = (today: string, timeZone: string) =>
	startOfLocalDay(addDays(today, -1), timeZone);

// Never below zero: waste, a count or an expiry can leave fewer units than were promised.
export const sellableUnits = (onHand: number, committed: number) =>
	Math.max(0, onHand - committed);

// Capped so the exact stock above the limit per line is not published.
export const lineMax = (sellable: number, maxPerLine: number) =>
	Math.min(sellable, maxPerLine);

export const unitsAvailability = (sellable: number): StockAvailability =>
	sellable > 0 ? "in_stock" : "sold_out";
