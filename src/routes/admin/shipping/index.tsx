import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { zonesQuery } from "#/features/shipping/queries";
import { zoneSearchDefaults } from "#/features/shipping/search";
import { ZonesTable } from "#/features/shipping/zones-table";
import { zoneListSearch } from "#/lib/schemas/shipping";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/shipping/")({
	validateSearch: zoneListSearch,
	search: { middlewares: [stripSearchParams(zoneSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(zonesQuery(deps));
	},
	component: Shipping,
});

function Shipping() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_shipping()} />
			<ZonesTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
