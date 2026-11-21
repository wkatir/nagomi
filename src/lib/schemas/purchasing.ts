import { z } from "zod";
import { PURCHASE_ORDER_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";
import { dayRange, fromAfterTo, fromNotAfterTo } from "./dates";

export const PURCHASE_SORTS = [
	"createdAt",
	"reference",
	"supplier",
	"status",
	"total",
	"orderedOn",
] as const;

// `q` is a reference or a supplier; the days are days of creation.
export const purchaseListSearch = pagedSearch(PURCHASE_SORTS, {
	sort: "createdAt",
	dir: "desc",
})
	.extend({
		status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
		supplierId: z.coerce.number().int().positive().optional(),
		...dayRange,
	})
	.refine(fromNotAfterTo, fromAfterTo);
export type PurchaseListSearch = z.infer<typeof purchaseListSearch>;
