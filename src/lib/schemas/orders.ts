import { z } from "zod";
import {
	ORDER_CHANNELS,
	ORDER_PAYMENT_STATUSES,
	ORDER_STATUSES,
} from "#/lib/enums";
import { pagedSearch } from "#/lib/list";
import { dayRange, fromAfterTo, fromNotAfterTo } from "./dates";

const filterShape = {
	q: z.string().trim().min(1).max(80).optional(),
	status: z.enum(ORDER_STATUSES).optional(),
	paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
	channel: z.enum(ORDER_CHANNELS).optional(),
	customerId: z.coerce.number().int().positive().optional(),
	...dayRange,
};

export const orderFilters = z
	.object(filterShape)
	.refine(fromNotAfterTo, fromAfterTo);

export const ORDER_SORTS = [
	"createdAt",
	"code",
	"customer",
	"total",
	"status",
] as const;

export const orderListSearch = pagedSearch(ORDER_SORTS, {
	sort: "createdAt",
	dir: "desc",
})
	.extend({
		status: filterShape.status,
		paymentStatus: filterShape.paymentStatus,
		channel: filterShape.channel,
		customerId: filterShape.customerId,
		...dayRange,
	})
	.refine(fromNotAfterTo, fromAfterTo);
export type OrderListSearch = z.infer<typeof orderListSearch>;
