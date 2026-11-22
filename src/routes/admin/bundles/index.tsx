import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { BundlesTable } from "#/features/bundles/bundles-table";
import { bundlesQuery } from "#/features/bundles/queries";
import { bundleListSearch } from "#/lib/schemas/bundles";
import { m } from "#/paraglide/messages";

const defaults = bundleListSearch.parse({});

export const Route = createFileRoute("/admin/bundles/")({
	validateSearch: bundleListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// Not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(bundlesQuery(deps));
	},
	component: Bundles,
});

function Bundles() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_bundles()} />
			<BundlesTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
