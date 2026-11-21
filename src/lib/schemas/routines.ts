import { z } from "zod";
import { PRODUCT_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const ROUTINE_SORTS = [
	"title",
	"position",
	"steps",
	"featured",
	"status",
] as const;

export const routineListSearch = pagedSearch(ROUTINE_SORTS, {
	sort: "position",
	dir: "asc",
}).extend({ status: z.enum(PRODUCT_STATUSES).optional() });
export type RoutineListSearch = z.infer<typeof routineListSearch>;
