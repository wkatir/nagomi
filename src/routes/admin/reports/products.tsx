import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import {
	ProductsReportView,
	rankLabel,
} from "#/features/reports/breakdown-reports";
import { productsReportQuery } from "#/features/reports/queries";
import {
	ReportSelect,
	ReportState,
	ReportToolbar,
} from "#/features/reports/report-parts";
import { reportCsvHref, reportRange } from "#/features/reports/search";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { PRODUCT_RANKS, productsSearch } from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/products")({
	staticData: { crumb: m.admin_report_products },
	validateSearch: productsSearch,
	search: { middlewares: [stripSearchParams(productsSearch.parse({}))] },
	loaderDeps: ({ search }) => ({ from: search.from, to: search.to }),
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			productsReportQuery(reportRange(deps, store.timeZone)),
		);
	},
	component: ProductsReportPage,
});

function ProductsReportPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...productsReportQuery(range),
		placeholderData: keepPreviousData,
	});
	return (
		<>
			<ReportToolbar
				question={m.admin_report_q_products()}
				csv={reportCsvHref("products", range)}
			>
				<DateRangeFilter
					value={range}
					onChange={(days) =>
						navigate({ search: (previous) => ({ ...previous, ...days }) })
					}
				/>
				<ReportSelect
					label={m.admin_report_rank_by()}
					value={search.rank}
					options={PRODUCT_RANKS.map((value) => ({
						value,
						label: m.admin_report_rank_option({ metric: rankLabel[value]() }),
					}))}
					onChange={(rank) =>
						navigate({ search: (previous) => ({ ...previous, rank }) })
					}
				/>
			</ReportToolbar>
			<ReportState query={query}>
				{(report) => <ProductsReportView report={report} rank={search.rank} />}
			</ReportState>
		</>
	);
}
