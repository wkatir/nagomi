import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import type { ArchivableStatus } from "#/lib/enums";
import { toQuery } from "#/lib/list";
import type { SupplierListSearch } from "#/lib/schemas/suppliers";

type Client = ReturnType<typeof api>["admin"];
type Suppliers = InferResponseType<Client["suppliers"]["$get"], 200>;
export type SupplierRow = Suppliers["items"][number];
export type Supplier = InferResponseType<
	Client["suppliers"][":id"]["$get"],
	200
>;
type SupplierItems = InferResponseType<
	Client["suppliers"]["items"]["$get"],
	200
>;
export type SupplierItem = SupplierItems[number];

const suppliersKeys = {
	all: ["admin", "suppliers"] as const,
	list: (search: SupplierListSearch) =>
		[...suppliersKeys.all, "list", search] as const,
	detail: (id: number) => [...suppliersKeys.all, "detail", id] as const,
	items: (id: number) => [...suppliersKeys.all, "items", id] as const,
	options: (status: ArchivableStatus | undefined) =>
		[...suppliersKeys.all, "options", status ?? "all"] as const,
};

export const suppliersQuery = (search: SupplierListSearch) =>
	queryOptions({
		queryKey: suppliersKeys.list(search),
		queryFn: () =>
			parseResponse(api().admin.suppliers.$get({ query: toQuery(search) })),
	});

export const supplierQuery = (id: number) =>
	queryOptions({
		queryKey: suppliersKeys.detail(id),
		queryFn: () =>
			parseResponse(
				api().admin.suppliers[":id"].$get({ param: { id: String(id) } }),
			),
	});

export const supplierItemsQuery = (id: number) =>
	queryOptions({
		queryKey: suppliersKeys.items(id),
		queryFn: () =>
			parseResponse(
				api().admin.suppliers.items.$get({
					query: { supplierId: String(id) },
				}),
			),
	});

export const supplierOptionsQuery = (status?: ArchivableStatus) =>
	queryOptions({
		queryKey: suppliersKeys.options(status),
		queryFn: () =>
			parseResponse(
				api().admin.suppliers.options.$get({
					query: status ? { status } : {},
				}),
			),
	});
