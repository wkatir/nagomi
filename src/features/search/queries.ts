import { queryOptions } from "@tanstack/react-query";
import { api, parseResponse } from "#/lib/api";

export const adminSearchQuery = (q: string) =>
	queryOptions({
		queryKey: ["admin", "search", q],
		queryFn: () => parseResponse(api().admin.search.$get({ query: { q } })),
	});
