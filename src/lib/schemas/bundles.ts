import { z } from "zod";
import { PRODUCT_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const BUNDLE_SORTS = [
	"name",
	"position",
	"items",
	"price",
	"featured",
	"status",
] as const;

export const BUNDLE_MAX_ITEMS = 12;
export const BUNDLE_MIN_ITEMS = 2;

export const bundleListSearch = pagedSearch(BUNDLE_SORTS, {
	sort: "position",
	dir: "asc",
}).extend({ status: z.enum(PRODUCT_STATUSES).optional() });
export type BundleListSearch = z.infer<typeof bundleListSearch>;
