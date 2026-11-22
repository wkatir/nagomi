import { z } from "zod";
import { daysBetween } from "#/lib/dates";
import { calendarDate } from "./dates";

// Checked by both the API and the screens, so a screen never asks for a range the API
// refuses.

export const GRANULARITIES = ["day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

// Three years of days at most per request.
export const MAX_RANGE_DAYS = 1096;

export const rangeFields = { from: calendarDate, to: calendarDate };
export const validRange = (r: { from: string; to: string }) =>
	r.from <= r.to && daysBetween(r.from, r.to) < MAX_RANGE_DAYS;
export const rangeIssue = {
	message: `from must not be after to, and the range at most ${MAX_RANGE_DAYS} days`,
	path: ["to"],
};

export const reorderFields = {
	lookbackWeeks: z.coerce.number().int().min(1).max(52).default(8),
	targetWeeks: z.coerce.number().int().min(1).max(52),
	// Overrides every supplier's lead time when given.
	leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
};

export const reportDays = z
	.object({ from: rangeFields.from.optional(), to: rangeFields.to.optional() })
	.refine((d) => (d.from === undefined) === (d.to === undefined), {
		message: "from and to go together",
		path: ["to"],
	})
	.refine(
		(d) => !d.from || !d.to || validRange({ from: d.from, to: d.to }),
		rangeIssue,
	);

export const salesSearch = z.object({
	granularity: z.enum(GRANULARITIES).default("day"),
});

export const LOOKBACK_WEEKS = [4, 8, 12, 26] as const;
export const TARGET_WEEKS = [2, 4, 8, 12] as const;
export const reorderSearch = z.object({
	lookbackWeeks: z.literal(LOOKBACK_WEEKS).default(8),
	targetWeeks: z.literal(TARGET_WEEKS).default(4),
});

export const PRODUCT_RANKS = ["merchandise", "units", "unitsPerDay"] as const;
export type ProductRank = (typeof PRODUCT_RANKS)[number];
export const productsSearch = z.object({
	rank: z.enum(PRODUCT_RANKS).default("merchandise"),
});
