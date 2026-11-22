import { addDays, storeToday } from "#/lib/dates";
import { toQuery } from "#/lib/list";

const DEFAULT_REPORT_DAYS = 30;

export type ReportRange = { from: string; to: string };

// The URL carries both ends or neither (reportDays).
export function reportRange(
	search: { from?: string; to?: string },
	timeZone: string,
): ReportRange {
	const { from, to } = search;
	if (from !== undefined && to !== undefined) return { from, to };
	const today = storeToday(timeZone);
	return { from: addDays(today, -(DEFAULT_REPORT_DAYS - 1)), to: today };
}

type ReportCsv =
	| "sales"
	| "products"
	| "brands"
	| "losses"
	| "stock"
	| "customers"
	| "fulfillment"
	| "reorder";

export function reportCsvHref(
	report: ReportCsv,
	query: Record<string, string | number | undefined>,
) {
	const withTotals =
		report === "sales" || report === "products" || report === "brands";
	const params = new URLSearchParams(
		toQuery({ ...query, totals: withTotals ? "true" : undefined }),
	).toString();
	return `/api/admin/exports/reports/${report}.csv${params ? `?${params}` : ""}`;
}
