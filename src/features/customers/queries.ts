import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { CustomerListSearch } from "#/lib/schemas/customers";

const customersKeys = {
	all: ["admin", "customers"] as const,
	list: (search: CustomerListSearch) =>
		[...customersKeys.all, "list", search] as const,
	detail: (id: number) => [...customersKeys.all, "detail", id] as const,
};

type Client = ReturnType<typeof api>["admin"]["customers"];
export type AdminCustomers = InferResponseType<Client["$get"], 200>;
export type AdminCustomer = InferResponseType<Client[":id"]["$get"], 200>;

export const customersQuery = (search: CustomerListSearch) =>
	queryOptions({
		queryKey: customersKeys.list(search),
		queryFn: () =>
			parseResponse(api().admin.customers.$get({ query: toQuery(search) })),
	});

export const customerQuery = (id: number) =>
	queryOptions({
		queryKey: customersKeys.detail(id),
		queryFn: () =>
			parseResponse(
				api().admin.customers[":id"].$get({ param: { id: String(id) } }),
			),
	});
