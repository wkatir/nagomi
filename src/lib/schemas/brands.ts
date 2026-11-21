import { z } from "zod";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const BRAND_SORTS = ["name", "country", "products", "status"] as const;

export const brandListSearch = pagedSearch(BRAND_SORTS, {
	sort: "name",
	dir: "asc",
}).extend({ status: z.enum(ARCHIVABLE_STATUSES).optional() });
export type BrandListSearch = z.infer<typeof brandListSearch>;
