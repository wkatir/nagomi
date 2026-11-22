import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { CategoryListSearch } from "#/lib/schemas/categories";

type CategoriesApi = ReturnType<typeof api>["admin"]["categories"];
export type CategoryRow = InferResponseType<
	CategoriesApi["$get"],
	200
>["items"][number];
export type CategoryDetail = InferResponseType<
	CategoriesApi[":id"]["$get"],
	200
>;

export const categoriesKeys = { all: ["admin", "categories"] as const };

export const categoriesQuery = (search: CategoryListSearch) =>
	queryOptions({
		queryKey: [...categoriesKeys.all, "list", search],
		queryFn: () =>
			parseResponse(api().admin.categories.$get({ query: toQuery(search) })),
	});

export const categoryQuery = (id: number) =>
	queryOptions({
		queryKey: [...categoriesKeys.all, "detail", id],
		queryFn: () =>
			parseResponse(
				api().admin.categories[":id"].$get({ param: { id: String(id) } }),
			),
	});
