import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { QueryError } from "#/components/admin/query-error";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { invoiceAttentionQuery } from "#/features/invoices/queries";
import {
	OverviewBlocks,
	OverviewSkeleton,
} from "#/features/overview/overview-blocks";
import { dashboardQuery } from "#/features/overview/queries";
import { DASHBOARD_DAYS, dashboardSearch } from "#/lib/schemas/dashboard";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/")({
	staticData: { crumb: m.admin_nav_overview },
	validateSearch: dashboardSearch,
	search: { middlewares: [stripSearchParams(dashboardSearch.parse({}))] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the page has its own loading state.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(dashboardQuery(deps.days));
		void context.queryClient.prefetchQuery(invoiceAttentionQuery);
	},
	component: Overview,
});

function Overview() {
	const { days } = Route.useSearch();
	const navigate = Route.useNavigate();
	const query = useQuery({
		...dashboardQuery(days),
		placeholderData: keepPreviousData,
	});

	return (
		<>
			<PageHeader
				title={m.admin_overview_title({ days })}
				action={
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						aria-label={m.admin_overview_window()}
						value={String(days)}
						onValueChange={(value) => {
							const next = DASHBOARD_DAYS.find((d) => String(d) === value);
							// Choosing the window already on is not a choice.
							if (next) navigate({ search: { days: next } });
						}}
					>
						{DASHBOARD_DAYS.map((d) => (
							<ToggleGroupItem key={d} value={String(d)}>
								{m.admin_overview_days_n({ count: d })}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
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
