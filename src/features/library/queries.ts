import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";

type MediaApi = ReturnType<typeof api>["admin"]["media"];
export type MediaUsage = InferResponseType<
	MediaApi[":id"]["usage"]["$get"],
	200
>;

export const mediaUsageQuery = (id: number) =>
	queryOptions({
		queryKey: ["admin", "media", "usage", id],
		queryFn: () =>
			parseResponse(
				api().admin.media[":id"].usage.$get({ param: { id: String(id) } }),
			),
	});
