import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { stockReportQuery } from "#/features/reports/queries";
import { ReportState, ReportToolbar } from "#/features/reports/report-parts";
import { reportCsvHref, reportRange } from "#/features/reports/search";
import { StockReportView } from "#/features/reports/stock-report";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/stock")({
	staticData: { crumb: m.admin_report_stock },
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			stockReportQuery(reportRange(deps, store.timeZone)),
		);
	},
	component: StockReportPage,
});

function StockReportPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...stockReportQuery(range),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar
				question={m.admin_report_q_stock()}
				csv={reportCsvHref("stock", range)}
			>
				<DateRangeFilter
					value={range}
					onChange={(days) =>
						navigate({ search: (previous) => ({ ...previous, ...days }) })
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => <StockReportView report={report} />}
			</ReportState>
		</>
	);
}
