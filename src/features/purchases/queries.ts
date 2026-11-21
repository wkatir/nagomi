import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { PurchaseListSearch } from "#/lib/schemas/purchasing";

type Client = ReturnType<typeof api>["admin"]["purchase-orders"];
type Purchases = InferResponseType<Client["$get"], 200>;
export type PurchaseRow = Purchases["items"][number];
export type Purchase = InferResponseType<Client[":id"]["$get"], 200>;

// Every query of the purchases module starts with `purchasesKeys.all`, so one invalidation
// refreshes the lists and the open purchase order after a change.
const purchasesKeys = {
	all: ["admin", "purchase-orders"] as const,
	list: (search: PurchaseListSearch) =>
		[...purchasesKeys.all, "list", search] as const,
	detail: (id: number) => [...purchasesKeys.all, "detail", id] as const,
};

export const purchasesQuery = (search: PurchaseListSearch) =>
	queryOptions({
		queryKey: purchasesKeys.list(search),
		queryFn: () =>
			parseResponse(
				api().admin["purchase-orders"].$get({ query: toQuery(search) }),
			),
	});

export const purchaseQuery = (id: number) =>
	queryOptions({
		queryKey: purchasesKeys.detail(id),
		queryFn: () =>
			parseResponse(
				api().admin["purchase-orders"][":id"].$get({
					param: { id: String(id) },
				}),
			),
	});
