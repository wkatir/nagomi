import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { PurchasesTable } from "#/features/purchases/purchases-table";
import { purchasesQuery } from "#/features/purchases/queries";
import { purchaseSearchDefaults } from "#/features/purchases/search";
import { supplierOptionsQuery } from "#/features/suppliers/queries";
import { purchaseListSearch } from "#/lib/schemas/purchasing";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/purchases/")({
	validateSearch: purchaseListSearch,
	search: { middlewares: [stripSearchParams(purchaseSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Only the suppliers of the filter are awaited; prefetchQuery never rejects.
	loader: async ({ context, deps }) => {
		void context.queryClient.prefetchQuery(purchasesQuery(deps));
		await context.queryClient.ensureQueryData(supplierOptionsQuery());
	},
	component: Purchases,
});

function Purchases() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_purchases()} />
			<PurchasesTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
