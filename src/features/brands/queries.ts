import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { BrandListSearch } from "#/lib/schemas/brands";

type BrandsApi = ReturnType<typeof api>["admin"]["brands"];
export type BrandRow = InferResponseType<
	BrandsApi["$get"],
	200
>["items"][number];
export type BrandDetail = InferResponseType<BrandsApi[":id"]["$get"], 200>;

export const brandsKeys = { all: ["admin", "brands"] as const };

export const brandsQuery = (search: BrandListSearch) =>
	queryOptions({
		queryKey: [...brandsKeys.all, "list", search],
		queryFn: () =>
			parseResponse(api().admin.brands.$get({ query: toQuery(search) })),
	});

export const brandQuery = (id: number) =>
	queryOptions({
		queryKey: [...brandsKeys.all, "detail", id],
		queryFn: () =>
			parseResponse(
				api().admin.brands[":id"].$get({ param: { id: String(id) } }),
			),
	});
