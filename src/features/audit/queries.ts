import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { AuditListSearch } from "#/lib/schemas/audit";

type AuditApi = ReturnType<typeof api>["admin"]["audit-events"];
export type AuditEvent = InferResponseType<
	AuditApi["$get"],
	200
>["items"][number];

const auditKeys = { all: ["admin", "audit"] as const };

export const auditFeedQuery = (filters: AuditListSearch) =>
	infiniteQueryOptions({
		queryKey: [...auditKeys.all, "feed", filters],
		initialPageParam: undefined as number | undefined,
		queryFn: ({ pageParam }) =>
			parseResponse(
				api().admin["audit-events"].$get({
					query: toQuery({ ...filters, cursor: pageParam }),
				}),
			),
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});

export const auditActorsQuery = queryOptions({
	queryKey: [...auditKeys.all, "actors"],
	queryFn: () => parseResponse(api().admin["audit-events"].actors.$get()),
});
