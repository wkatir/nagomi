import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { LotsTable } from "#/features/inventory/lots-table";
import { lotsQuery } from "#/features/inventory/queries";
import { lotSearchDefaults } from "#/features/inventory/search";
import { lotListSearch } from "#/lib/schemas/inventory";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/inventory/lots")({
	staticData: { crumb: m.admin_inventory_tab_lots },
	validateSearch: lotListSearch,
	search: { middlewares: [stripSearchParams(lotSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(lotsQuery(deps));
	},
	component: Lots,
});

function Lots() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<LotsTable
			search={search}
			onSearchChange={(change) =>
				navigate({ search: (previous) => ({ ...previous, ...change }) })
			}
		/>
	);
}
