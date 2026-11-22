import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { FulfillmentReportView } from "#/features/reports/fulfillment-report";
import { fulfillmentReportQuery } from "#/features/reports/queries";
import { ReportState, ReportToolbar } from "#/features/reports/report-parts";
import { reportCsvHref, reportRange } from "#/features/reports/search";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/fulfillment")({
	staticData: { crumb: m.admin_report_fulfillment },
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			fulfillmentReportQuery(reportRange(deps, store.timeZone)),
		);
	},
	component: FulfillmentReportPage,
});

function FulfillmentReportPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...fulfillmentReportQuery(range),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar
				question={m.admin_report_q_fulfillment()}
				csv={reportCsvHref("fulfillment", range)}
			>
				<DateRangeFilter
					value={range}
					onChange={(days) =>
						navigate({ search: (previous) => ({ ...previous, ...days }) })
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => <FulfillmentReportView report={report} />}
			</ReportState>
		</>
	);
}
