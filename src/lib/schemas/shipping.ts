import { z } from "zod";
import { ARCHIVABLE_STATUSES, SHIPPING_METHODS } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

// In minor units.
export const ZONE_MAX_AMOUNT = 100_000_000;
export const ZONE_MAX_DAYS = 365;
export const ZONE_MAX_POSITION = 1000;

// `name` is the name in the store's default language; `deliveryDays` sorts by the earliest
// delivery, then the latest.
export const ZONE_SORTS = [
	"position",
	"name",
	"method",
	"fee",
	"deliveryDays",
] as const;

// A store has a handful of zones, so there is no text search.
export const zoneListSearch = pagedSearch(ZONE_SORTS, {
	sort: "position",
	dir: "asc",
})
	.omit({ q: true })
	.extend({
		status: z.enum(ARCHIVABLE_STATUSES).optional(),
		method: z.enum(SHIPPING_METHODS).optional(),
	});
export type ZoneListSearch = z.infer<typeof zoneListSearch>;
