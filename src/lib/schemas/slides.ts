import { z } from "zod";
import { PRODUCT_STATUSES } from "#/lib/enums";

export const slideListSearch = z.object({
	status: z.enum(PRODUCT_STATUSES).optional(),
});
