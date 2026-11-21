import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { suppliersQuery } from "#/features/suppliers/queries";
import { supplierSearchDefaults } from "#/features/suppliers/search";
import { SuppliersTable } from "#/features/suppliers/suppliers-table";
import { supplierListSearch } from "#/lib/schemas/suppliers";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/suppliers/")({
	validateSearch: supplierListSearch,
	search: { middlewares: [stripSearchParams(supplierSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(suppliersQuery(deps));
	},
	component: Suppliers,
});

function Suppliers() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_suppliers()} />
			<SuppliersTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
