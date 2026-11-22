import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { ReorderView } from "#/features/inventory/reorder-view";
import { reorderSearchDefaults } from "#/features/inventory/search";
import { reorderReportQuery } from "#/features/reports/queries";
import { reorderSearch } from "#/lib/schemas/inventory";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/inventory/reorder")({
	staticData: { crumb: m.admin_inventory_tab_reorder },
	validateSearch: reorderSearch,
	search: { middlewares: [stripSearchParams(reorderSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Not awaited, so changing the weeks keeps the page on screen; prefetchQuery never rejects.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(reorderReportQuery(deps));
	},
	component: Reorder,
});

function Reorder() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<ReorderView
			search={search}
			onSearchChange={(change) =>
				navigate({ search: (previous) => ({ ...previous, ...change }) })
			}
		/>
	);
}
