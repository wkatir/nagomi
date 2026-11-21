import { z } from "zod";

// The API accepts 1 to 365.
export const DASHBOARD_DAYS = [7, 30, 90] as const;

export const dashboardSearch = z.object({
	days: z.literal(DASHBOARD_DAYS).default(30),
});
