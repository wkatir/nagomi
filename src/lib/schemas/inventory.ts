import { z } from "zod";
import { MOVEMENT_KINDS, MOVEMENT_REASONS } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";
import { dayRange, fromAfterTo, fromNotAfterTo } from "./dates";

export const STOCK_SORTS = [
	"product",
	"sku",
	"onHand",
	"stockValue",
	"reorderPoint",
] as const;

export const STOCK_VIEWS = ["low", "out"] as const;

export const stockListSearch = pagedSearch(STOCK_SORTS, {
	sort: "product",
	dir: "asc",
}).extend({
	view: z.enum(STOCK_VIEWS).optional(),
});
export type StockListSearch = z.infer<typeof stockListSearch>;

export const LOT_SORTS = [
	"receivedAt",
	"product",
	"sku",
	"code",
	"available",
	"unitCost",
	"value",
] as const;

export const lotListSearch = pagedSearch(LOT_SORTS, {
	sort: "receivedAt",
	dir: "asc",
});
export type LotListSearch = z.infer<typeof lotListSearch>;

export const movementFilters = z
	.object({
		kind: z.enum(MOVEMENT_KINDS).optional(),
		reason: z.enum(MOVEMENT_REASONS).optional(),
		sku: z.string().trim().min(1).max(60).optional(),
		lotId: z.coerce.number().int().positive().optional(),
		...dayRange,
	})
	.refine(fromNotAfterTo, fromAfterTo);
export type MovementFilters = z.infer<typeof movementFilters>;

export const reorderSearch = z.object({
	lookbackWeeks: z.coerce.number().int().min(1).max(52).default(8),
	targetWeeks: z.coerce.number().int().min(1).max(52).default(4),
});
export type ReorderSearch = z.infer<typeof reorderSearch>;
