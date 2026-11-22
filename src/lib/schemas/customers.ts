import { z } from "zod";
import { CUSTOMER_SEGMENTS } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const MARKETING_CHANNELS = ["email", "whatsapp"] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const CUSTOMER_SORTS = [
	"name",
	"orders",
	"spent",
	"lastOrder",
	"createdAt",
] as const;

export const customerListSearch = pagedSearch(CUSTOMER_SORTS, {
	sort: "createdAt",
	dir: "desc",
}).extend({
	segment: z.enum(CUSTOMER_SEGMENTS).optional(),
	marketing: z.enum(MARKETING_CHANNELS).optional(),
});
export type CustomerListSearch = z.infer<typeof customerListSearch>;

export const customerFilters = customerListSearch.pick({
	q: true,
	segment: true,
	marketing: true,
});

export const campaignFilters = z.object({
	channel: z.enum(MARKETING_CHANNELS),
	segment: z.enum(CUSTOMER_SEGMENTS).optional(),
});
