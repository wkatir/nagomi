import { queryOptions } from "@tanstack/react-query";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { OrderListSearch } from "#/lib/schemas/orders";

// Every query of the orders module starts with `ordersKeys.all`, so one invalidation
// refreshes the lists and the open order after a change.
const ordersKeys = {
	all: ["admin", "orders"] as const,
	list: (search: OrderListSearch) =>
		[...ordersKeys.all, "list", search] as const,
	detail: (id: number) => [...ordersKeys.all, "detail", id] as const,
};

export const ordersQuery = (search: OrderListSearch) =>
	queryOptions({
		queryKey: ordersKeys.list(search),
		queryFn: () =>
			parseResponse(api().admin.orders.$get({ query: toQuery(search) })),
	});

export const orderQuery = (id: number) =>
	queryOptions({
		queryKey: ordersKeys.detail(id),
		queryFn: () =>
			parseResponse(
				api().admin.orders[":id"].$get({ param: { id: String(id) } }),
			),
	});

export const sellableVariantsQuery = (q: string) =>
	queryOptions({
		queryKey: ["admin", "products", "sellable", q],
		queryFn: () =>
			parseResponse(
				api().admin.products.$get({ query: { q, status: "published" } }),
			),
	});
