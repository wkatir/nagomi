import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { BundleListSearch } from "#/lib/schemas/bundles";

type BundlesApi = ReturnType<typeof api>["admin"]["bundles"];
export type BundleRow = InferResponseType<
	BundlesApi["$get"],
	200
>["items"][number];
export type BundleDetail = InferResponseType<BundlesApi[":id"]["$get"], 200>;

export const bundlesKeys = { all: ["admin", "bundles"] as const };

export const bundlesQuery = (search: BundleListSearch) =>
	queryOptions({
		queryKey: [...bundlesKeys.all, "list", search],
		queryFn: () =>
			parseResponse(api().admin.bundles.$get({ query: toQuery(search) })),
	});

export const bundleQuery = (id: number) =>
	queryOptions({
		queryKey: [...bundlesKeys.all, "detail", id],
		queryFn: () =>
			parseResponse(
				api().admin.bundles[":id"].$get({ param: { id: String(id) } }),
			),
	});
