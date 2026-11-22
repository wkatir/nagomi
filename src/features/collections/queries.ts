import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { CollectionListSearch } from "#/lib/schemas/collections";

type CollectionsApi = ReturnType<typeof api>["admin"]["collections"];
export type CollectionRow = InferResponseType<
	CollectionsApi["$get"],
	200
>["items"][number];
export type CollectionDetail = InferResponseType<
	CollectionsApi[":id"]["$get"],
	200
>;

export const collectionsKeys = { all: ["admin", "collections"] as const };

export const collectionsQuery = (search: CollectionListSearch) =>
	queryOptions({
		queryKey: [...collectionsKeys.all, "list", search],
		queryFn: () =>
			parseResponse(api().admin.collections.$get({ query: toQuery(search) })),
	});

export const collectionQuery = (id: number) =>
	queryOptions({
		queryKey: [...collectionsKeys.all, "detail", id],
		queryFn: () =>
			parseResponse(
				api().admin.collections[":id"].$get({ param: { id: String(id) } }),
			),
	});
