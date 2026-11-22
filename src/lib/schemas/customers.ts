import { z } from "zod";
import { CUSTOMER_SEGMENTS } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

// `name` ignores case and accents; `orders`, `spent` and `lastOrder` count the booked orders
// (confirmed, fulfilled, delivered).
export const CUSTOMER_SORTS = [
	"name",
	"orders",
	"spent",
	"lastOrder",
	"createdAt",
] as const;

// `q` is a name, an email or the digits of a phone.
export const customerListSearch = pagedSearch(CUSTOMER_SORTS, {
	sort: "createdAt",
	dir: "desc",
}).extend({ segment: z.enum(CUSTOMER_SEGMENTS).optional() });
export type CustomerListSearch = z.infer<typeof customerListSearch>;

// Shared by the list and the CSV export.
export const customerFilters = customerListSearch.pick({
	q: true,
	segment: true,
});
