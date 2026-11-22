import { z } from "zod";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const SUPPLIER_SORTS = [
	"name",
	"leadTimeDays",
	"openPurchaseOrders",
	"createdAt",
] as const;

export const supplierListSearch = pagedSearch(SUPPLIER_SORTS, {
	sort: "name",
	dir: "asc",
}).extend({
	status: z.enum(ARCHIVABLE_STATUSES).optional(),
});
export type SupplierListSearch = z.infer<typeof supplierListSearch>;
