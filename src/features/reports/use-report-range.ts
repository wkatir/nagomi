import { useSuspenseQuery } from "@tanstack/react-query";
import { storeQuery } from "#/lib/queries";
import { type ReportRange, reportRange } from "./search";

export function useReportRange(search: {
	from?: string;
	to?: string;
}): ReportRange {
	const { data: store } = useSuspenseQuery(storeQuery);
	return reportRange(search, store.timeZone);
}
