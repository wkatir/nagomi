import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { InvoiceListSearch } from "#/lib/schemas/invoices";
import { invoiceSearchDefaults } from "./search";

// Every query of the invoices module starts with `invoicesKeys.all`, so one invalidation
// refreshes the list, an order's documents, the figures that need a person and the connection.
const all = ["admin", "invoices"] as const;
export const invoicesKeys = {
	all,
	list: (search: InvoiceListSearch) => [...all, "list", search] as const,
	order: (orderId: number) => [...all, "order", orderId] as const,
	attention: [...all, "attention"] as const,
	connection: [...all, "connection"] as const,
};

type Client = ReturnType<typeof api>["admin"]["invoices"];
export type InvoicePage = InferResponseType<Client["$get"], 200>;
export type AdminInvoice = InvoicePage["items"][number];
export type InvoiceAttention = InferResponseType<
	Client["attention"]["$get"],
	200
>;
export type InvoiceConnection = InferResponseType<
	Client["connection"]["$get"],
	200
>;

const fetchPage = (search: InvoiceListSearch) =>
	parseResponse(api().admin.invoices.$get({ query: toQuery(search) }));

export const invoicesQuery = (search: InvoiceListSearch) =>
	queryOptions({
		queryKey: invoicesKeys.list(search),
		queryFn: () => fetchPage(search),
	});

// Not paged: an order has a handful at most (one live, and the ones rejected, failed or
// voided before it).
export const orderInvoicesQuery = (orderId: number) =>
	queryOptions({
		queryKey: invoicesKeys.order(orderId),
		queryFn: () =>
			fetchPage({ ...invoiceSearchDefaults, orderId, pageSize: 100 }),
	});

export const invoiceAttentionQuery = queryOptions({
	queryKey: invoicesKeys.attention,
	queryFn: () => parseResponse(api().admin.invoices.attention.$get()),
});

export const invoiceConnectionQuery = queryOptions({
	queryKey: invoicesKeys.connection,
	queryFn: () => parseResponse(api().admin.invoices.connection.$get()),
});
