import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { salesReportQuery } from "#/features/reports/queries";
import {
	ReportSelect,
	ReportState,
	ReportToolbar,
} from "#/features/reports/report-parts";
import { SalesReportView } from "#/features/reports/sales-report";
import { reportCsvHref, reportRange } from "#/features/reports/search";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { GRANULARITIES, salesSearch } from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";

const granularityLabel = {
	day: m.admin_report_by_day,
	week: m.admin_report_by_week,
	month: m.admin_report_by_month,
} as const;

export const Route = createFileRoute("/admin/reports/")({
	staticData: { crumb: m.admin_report_sales },
	validateSearch: salesSearch,
	search: { middlewares: [stripSearchParams(salesSearch.parse({}))] },
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			salesReportQuery(reportRange(deps, store.timeZone), deps.granularity),
		);
	},
	component: SalesReportPage,
});

function SalesReportPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...salesReportQuery(range, search.granularity),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar
				question={m.admin_report_q_sales()}
				csv={reportCsvHref("sales", {
					...range,
					granularity: search.granularity,
				})}
			>
				<DateRangeFilter
					value={range}
					onChange={(days) =>
						navigate({ search: (previous) => ({ ...previous, ...days }) })
					}
				/>
				<ReportSelect
					label={m.admin_report_group_by()}
					value={search.granularity}
					options={GRANULARITIES.map((value) => ({
						value,
						label: granularityLabel[value](),
					}))}
					onChange={(granularity) =>
						navigate({ search: (previous) => ({ ...previous, granularity }) })
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => (
					<SalesReportView report={report} granularity={search.granularity} />
				)}
			</ReportState>
		</>
	);
}
