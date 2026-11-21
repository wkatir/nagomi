import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";

export type AdminDashboard = InferResponseType<
	ReturnType<typeof api>["admin"]["dashboard"]["$get"],
	200
>;

// `days` includes today.
export const dashboardQuery = (days: number) =>
	queryOptions({
		queryKey: ["admin", "dashboard", days],
		queryFn: () =>
			parseResponse(
				api().admin.dashboard.$get({ query: { days: String(days) } }),
			),
	});
