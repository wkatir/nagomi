import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { LossesReportView } from "#/features/reports/losses-report";
import { lossesReportQuery } from "#/features/reports/queries";
import { ReportState, ReportToolbar } from "#/features/reports/report-parts";
import { reportCsvHref, reportRange } from "#/features/reports/search";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/losses")({
	staticData: { crumb: m.admin_report_losses },
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			lossesReportQuery(reportRange(deps, store.timeZone)),
		);
	},
	component: LossesReportPage,
});

function LossesReportPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...lossesReportQuery(range),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar
				question={m.admin_report_q_losses()}
				csv={reportCsvHref("losses", range)}
			>
				<DateRangeFilter
					value={range}
					onChange={(days) =>
						navigate({ search: (previous) => ({ ...previous, ...days }) })
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => <LossesReportView report={report} />}
			</ReportState>
		</>
	);
}
