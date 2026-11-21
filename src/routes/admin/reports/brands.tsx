import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { BrandsReportView } from "#/features/reports/breakdown-reports";
import { brandsReportQuery } from "#/features/reports/queries";
import { ReportState, ReportToolbar } from "#/features/reports/report-parts";
import { reportCsvHref, reportRange } from "#/features/reports/search";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/brands")({
	staticData: { crumb: m.admin_report_brands },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the report has its own loading state.
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			brandsReportQuery(reportRange(deps, store.timeZone)),
		);
	},
	component: BrandsReportPage,
});

function BrandsReportPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...brandsReportQuery(range),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar csv={reportCsvHref("brands", range)}>
				<DateRangeFilter
					value={range}
					onChange={(days) =>
						navigate({ search: (previous) => ({ ...previous, ...days }) })
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => <BrandsReportView report={report} />}
			</ReportState>
		</>
	);
}
