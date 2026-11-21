import { z } from "zod";
import { PRODUCT_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const COLLECTION_SORTS = [
	"title",
	"position",
	"products",
	"home",
	"status",
] as const;

export const collectionListSearch = pagedSearch(COLLECTION_SORTS, {
	sort: "position",
	dir: "asc",
}).extend({ status: z.enum(PRODUCT_STATUSES).optional() });
export type CollectionListSearch = z.infer<typeof collectionListSearch>;
