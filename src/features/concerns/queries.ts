import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { ConcernListSearch } from "#/lib/schemas/concerns";

type ConcernsApi = ReturnType<typeof api>["admin"]["concerns"];
export type ConcernRow = InferResponseType<
	ConcernsApi["$get"],
	200
>["items"][number];
export type ConcernDetail = InferResponseType<ConcernsApi[":id"]["$get"], 200>;

// Every query of the needs module starts with `concernsKeys.all`, so one invalidation
// refreshes the list and the open dialog after a change.
export const concernsKeys = { all: ["admin", "concerns"] as const };

export const concernsQuery = (search: ConcernListSearch) =>
	queryOptions({
		queryKey: [...concernsKeys.all, "list", search],
		queryFn: () =>
			parseResponse(api().admin.concerns.$get({ query: toQuery(search) })),
	});

export const concernQuery = (id: number) =>
	queryOptions({
		queryKey: [...concernsKeys.all, "detail", id],
		queryFn: () =>
			parseResponse(
				api().admin.concerns[":id"].$get({ param: { id: String(id) } }),
			),
	});

// Names are in the store's default language.
export const concernOptionsQuery = queryOptions({
	queryKey: [...concernsKeys.all, "options"],
	queryFn: () => parseResponse(api().admin.concerns.options.$get()),
});
