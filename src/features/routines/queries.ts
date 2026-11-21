import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { RoutineListSearch } from "#/lib/schemas/routines";

type RoutinesApi = ReturnType<typeof api>["admin"]["routines"];
export type RoutineRow = InferResponseType<
	RoutinesApi["$get"],
	200
>["items"][number];
export type RoutineDetail = InferResponseType<RoutinesApi[":id"]["$get"], 200>;

// Every query of the routines module starts with `routinesKeys.all`, so one invalidation
// refreshes the list and the open routine after a change.
export const routinesKeys = { all: ["admin", "routines"] as const };

export const routinesQuery = (search: RoutineListSearch) =>
	queryOptions({
		queryKey: [...routinesKeys.all, "list", search],
		queryFn: () =>
			parseResponse(api().admin.routines.$get({ query: toQuery(search) })),
	});

export const routineQuery = (id: number) =>
	queryOptions({
		queryKey: [...routinesKeys.all, "detail", id],
		queryFn: () =>
			parseResponse(
				api().admin.routines[":id"].$get({ param: { id: String(id) } }),
			),
	});
