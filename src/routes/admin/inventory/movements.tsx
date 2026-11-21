import { createFileRoute } from "@tanstack/react-router";
import { MovementsFeed } from "#/features/inventory/movements-feed";
import { movementsQuery } from "#/features/inventory/queries";
import { movementFilters } from "#/lib/schemas/inventory";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/inventory/movements")({
	staticData: { crumb: m.admin_inventory_tab_movements },
	validateSearch: movementFilters,
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the ledger has its own loading state. prefetchInfiniteQuery never
	// rejects; a failure shows in the ledger.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchInfiniteQuery(movementsQuery(deps));
	},
	component: Movements,
});

function Movements() {
	const filters = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<MovementsFeed
			filters={filters}
			onFiltersChange={(change) =>
				navigate({ search: (previous) => ({ ...previous, ...change }) })
			}
		/>
	);
}
