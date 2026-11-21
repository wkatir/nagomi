import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { reorderReportQuery } from "#/features/reports/queries";
import { ReorderReportView } from "#/features/reports/reorder-report";
import {
	ReportSelect,
	ReportState,
	ReportToolbar,
} from "#/features/reports/report-parts";
import { reportCsvHref } from "#/features/reports/search";
import {
	LOOKBACK_WEEKS,
	reorderSearch,
	TARGET_WEEKS,
} from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/reorder")({
	staticData: { crumb: m.admin_report_reorder },
	validateSearch: reorderSearch,
	search: { middlewares: [stripSearchParams(reorderSearch.parse({}))] },
	loaderDeps: ({ search }) => ({
		lookbackWeeks: search.lookbackWeeks,
		targetWeeks: search.targetWeeks,
	}),
	// Started, not awaited: the report has its own loading state.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(reorderReportQuery(deps));
	},
	component: ReorderReportPage,
});

function ReorderReportPage() {
	const { lookbackWeeks, targetWeeks } = Route.useSearch();
	const navigate = Route.useNavigate();
	const weeks = { lookbackWeeks, targetWeeks };
	const query = useQuery({
		...reorderReportQuery(weeks),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar csv={reportCsvHref("reorder", weeks)}>
				<ReportSelect
					label={m.admin_report_lookback()}
					value={lookbackWeeks}
					options={LOOKBACK_WEEKS.map((value) => ({
						value,
						label: m.admin_report_lookback_n({ count: value }),
					}))}
					onChange={(value) =>
						navigate({
							search: (previous) => ({ ...previous, lookbackWeeks: value }),
						})
					}
				/>
				<ReportSelect
					label={m.admin_report_target()}
					value={targetWeeks}
					options={TARGET_WEEKS.map((value) => ({
						value,
						label: m.admin_report_target_n({ count: value }),
					}))}
					onChange={(value) =>
						navigate({
							search: (previous) => ({ ...previous, targetWeeks: value }),
						})
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => <ReorderReportView report={report} />}
			</ReportState>
		</>
	);
}
