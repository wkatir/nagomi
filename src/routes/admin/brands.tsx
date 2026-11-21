import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { BrandsTable } from "#/features/brands/brands-table";
import { brandsQuery } from "#/features/brands/queries";
import { adminSettingsQuery } from "#/lib/queries";
import { brandListSearch } from "#/lib/schemas/brands";
import { m } from "#/paraglide/messages";

const defaults = brandListSearch.parse({});

export const Route = createFileRoute("/admin/brands")({
	staticData: { crumb: m.admin_nav_brands },
	validateSearch: brandListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// The table has its own loading state, and paging or filtering should keep the page on
	// screen: its query is started, not awaited (prefetchQuery never rejects; a failure shows in
	// the table). The settings the dialog needs are small and kept.
	loader: async ({ context, deps }) => {
		void context.queryClient.prefetchQuery(brandsQuery(deps));
		await context.queryClient.ensureQueryData(adminSettingsQuery);
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
