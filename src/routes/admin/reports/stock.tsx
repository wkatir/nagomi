import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { stockReportQuery } from "#/features/reports/queries";
import { ReportState, ReportToolbar } from "#/features/reports/report-parts";
import { reportCsvHref } from "#/features/reports/search";
import { StockReportView } from "#/features/reports/stock-report";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reports/stock")({
	staticData: { crumb: m.admin_report_stock },
	// Started, not awaited: the report has its own loading state.
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(stockReportQuery);
	},
	component: StockReportPage,
});

function StockReportPage() {
	const query = useQuery(stockReportQuery);
	return (
		<>
			<ReportToolbar csv={reportCsvHref("stock", {})} />
			<ReportState query={query}>
				{(report) => <StockReportView report={report} />}
			</ReportState>
		</>
	);
}
