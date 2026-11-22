import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { PageHeader } from "#/components/admin/page-header";
import { QueryError } from "#/components/admin/query-error";
import {
	OverviewBlocks,
	OverviewSkeleton,
} from "#/features/overview/overview-blocks";
import { dashboardQuery } from "#/features/overview/queries";
import { reportRange } from "#/features/reports/search";
import { useReportRange } from "#/features/reports/use-report-range";
import { storeQuery } from "#/lib/queries";
import { reportDays } from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/")({
	staticData: { crumb: m.admin_nav_overview },
	validateSearch: reportDays,
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const store = await context.queryClient.ensureQueryData(storeQuery);
		void context.queryClient.prefetchQuery(
			dashboardQuery(reportRange(deps, store.timeZone)),
		);
	},
	component: Overview,
});

function Overview() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const range = useReportRange(search);
	const query = useQuery({
		...dashboardQuery(range),
		placeholderData: keepPreviousData,
	});

	return (
		<>
			<PageHeader
				title={m.admin_overview_heading()}
				action={
					<DateRangeFilter
						value={range}
						onChange={(days) => navigate({ search: days })}
					/>
				}
			/>
			{query.isPending ? (
				<OverviewSkeleton />
			) : query.isError ? (
				<QueryError error={query.error} onRetry={() => query.refetch()} />
			) : (
				<div
					aria-busy={query.isFetching}
					className={query.isPlaceholderData ? "opacity-60" : undefined}
				>
					<OverviewBlocks d={query.data} />
				</div>
			)}
		</>
	);
}
