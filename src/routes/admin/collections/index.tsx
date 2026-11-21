import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { CollectionsTable } from "#/features/collections/collections-table";
import { collectionsQuery } from "#/features/collections/queries";
import { collectionListSearch } from "#/lib/schemas/collections";
import { m } from "#/paraglide/messages";

const defaults = collectionListSearch.parse({});

export const Route = createFileRoute("/admin/collections/")({
	validateSearch: collectionListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(collectionsQuery(deps));
	},
	component: Collections,
});

function Collections() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_collections()} />
			<CollectionsTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
