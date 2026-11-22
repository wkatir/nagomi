import { z } from "zod";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const CATEGORY_SORTS = [
	"name",
	"sortOrder",
	"products",
	"status",
] as const;

export const categoryListSearch = pagedSearch(CATEGORY_SORTS, {
	sort: "sortOrder",
	dir: "asc",
}).extend({ status: z.enum(ARCHIVABLE_STATUSES).optional() });
export type CategoryListSearch = z.infer<typeof categoryListSearch>;
