import { z } from "zod";
import { PROMOTION_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const PROMOTION_CODE = /^[A-Z0-9_-]{3,32}$/;

// In minor units.
export const PROMOTION_MAX_AMOUNT = 100_000_000;
export const PROMOTION_MAX_USES = 1_000_000;

// `usage` is the orders that used the code and were not cancelled; a promotion without a
// date sorts before the ones with one.
export const PROMOTION_SORTS = [
	"createdAt",
	"code",
	"usage",
	"startsOn",
	"endsOn",
] as const;

// `q` is part of the code.
export const promotionListSearch = pagedSearch(PROMOTION_SORTS, {
	sort: "createdAt",
	dir: "desc",
}).extend({ status: z.enum(PROMOTION_STATUSES).optional() });
export type PromotionListSearch = z.infer<typeof promotionListSearch>;
