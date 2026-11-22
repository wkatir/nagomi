import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { BrandsTable } from "#/features/brands/brands-table";
import { brandsQuery } from "#/features/brands/queries";
import { storeQuery } from "#/lib/queries";
import { brandListSearch } from "#/lib/schemas/brands";
import { m } from "#/paraglide/messages";

const defaults = brandListSearch.parse({});

export const Route = createFileRoute("/admin/brands")({
	staticData: { crumb: m.admin_nav_brands },
	validateSearch: brandListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// The table is not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: async ({ context, deps }) => {
		void context.queryClient.prefetchQuery(brandsQuery(deps));
		await context.queryClient.ensureQueryData(storeQuery);
	},
	component: Brands,
});

function Brands() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_brands()} />
			<BrandsTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
