import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { ReportRange } from "#/features/reports/search";
import { api, parseResponse } from "#/lib/api";

export type AdminDashboard = InferResponseType<
	ReturnType<typeof api>["admin"]["dashboard"]["$get"],
	200
>;

export const dashboardQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: ["admin", "dashboard", range],
		queryFn: () => parseResponse(api().admin.dashboard.$get({ query: range })),
	});
