import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { ProductListSearch } from "#/lib/schemas/products";

type ProductsApi = ReturnType<typeof api>["admin"]["products"];
export type ProductRow = InferResponseType<
	ProductsApi["list"]["$get"],
	200
>["items"][number];

// Every query of the products module starts with `productsKeys.all`, so one invalidation
// refreshes the lists, the open product and the pickers that sell from it.
export const productsKeys = {
	all: ["admin", "products"] as const,
	list: (search: ProductListSearch) =>
		[...productsKeys.all, "list", search] as const,
	detail: (id: number) => [...productsKeys.all, "detail", id] as const,
};

export const productsQuery = (search: ProductListSearch) =>
	queryOptions({
		queryKey: productsKeys.list(search),
		queryFn: () =>
			parseResponse(api().admin.products.list.$get({ query: toQuery(search) })),
	});

export const productQuery = (id: number) =>
	queryOptions({
		queryKey: productsKeys.detail(id),
		queryFn: () =>
			parseResponse(
				api().admin.products[":id"].$get({ param: { id: String(id) } }),
			),
	});

export const priceHistoryQuery = (id: number) =>
	queryOptions({
		queryKey: [...productsKeys.detail(id), "price-history"],
		queryFn: () =>
			parseResponse(
				api().admin.products[":id"]["price-history"].$get({
					param: { id: String(id) },
				}),
			),
	});
