import { z } from "zod";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const CONCERN_SORTS = [
	"name",
	"position",
	"products",
	"status",
] as const;

export const concernListSearch = pagedSearch(CONCERN_SORTS, {
	sort: "position",
	dir: "asc",
}).extend({ status: z.enum(ARCHIVABLE_STATUSES).optional() });
export type ConcernListSearch = z.infer<typeof concernListSearch>;
