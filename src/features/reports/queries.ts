import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import type { Granularity } from "#/lib/schemas/reports";
import type { ReportRange } from "./search";

type ReportsApi = ReturnType<typeof api>["admin"]["reports"];
export type SalesReport = InferResponseType<ReportsApi["sales"]["$get"], 200>;
export type ProductsReport = InferResponseType<
	ReportsApi["products"]["$get"],
	200
>;
export type BrandsReport = InferResponseType<ReportsApi["brands"]["$get"], 200>;
export type LossesReport = InferResponseType<ReportsApi["losses"]["$get"], 200>;
export type StockReport = InferResponseType<ReportsApi["stock"]["$get"], 200>;
export type CustomersReport = InferResponseType<
	ReportsApi["customers"]["$get"],
	200
>;
export type FulfillmentReport = InferResponseType<
	ReportsApi["fulfillment"]["$get"],
	200
>;
export type ReorderReport = InferResponseType<
	ReportsApi["reorder"]["$get"],
	200
>;

const reportKeys = { all: ["admin", "reports"] as const };

export const salesReportQuery = (
	range: ReportRange,
	granularity: Granularity,
) =>
	queryOptions({
		queryKey: [...reportKeys.all, "sales", range, granularity],
		queryFn: () =>
			parseResponse(
				api().admin.reports.sales.$get({ query: { ...range, granularity } }),
			),
	});

export const productsReportQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: [...reportKeys.all, "products", range],
		queryFn: () =>
			parseResponse(api().admin.reports.products.$get({ query: range })),
	});

export const brandsReportQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: [...reportKeys.all, "brands", range],
		queryFn: () =>
			parseResponse(api().admin.reports.brands.$get({ query: range })),
	});

export const lossesReportQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: [...reportKeys.all, "losses", range],
		queryFn: () =>
			parseResponse(api().admin.reports.losses.$get({ query: range })),
	});

export const stockReportQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: [...reportKeys.all, "stock", range],
		queryFn: () =>
			parseResponse(api().admin.reports.stock.$get({ query: range })),
	});

export const customersReportQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: [...reportKeys.all, "customers", range],
		queryFn: () =>
			parseResponse(api().admin.reports.customers.$get({ query: range })),
	});

export const fulfillmentReportQuery = (range: ReportRange) =>
	queryOptions({
		queryKey: [...reportKeys.all, "fulfillment", range],
		queryFn: () =>
			parseResponse(api().admin.reports.fulfillment.$get({ query: range })),
	});

export const reorderReportQuery = (weeks: {
	lookbackWeeks: number;
	targetWeeks: number;
}) =>
	queryOptions({
		queryKey: [...reportKeys.all, "reorder", weeks],
		queryFn: () =>
			parseResponse(
				api().admin.reports.reorder.$get({
					query: {
						lookbackWeeks: String(weeks.lookbackWeeks),
						targetWeeks: String(weeks.targetWeeks),
					},
				}),
			),
	});
