import { queryOptions } from "@tanstack/react-query";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { OrderListSearch } from "#/lib/schemas/orders";

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
