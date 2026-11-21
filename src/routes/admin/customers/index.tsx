import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { CustomersTable } from "#/features/customers/customers-table";
import { customersQuery } from "#/features/customers/queries";
import { customerSearchDefaults } from "#/features/customers/search";
import { customerListSearch } from "#/lib/schemas/customers";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/customers/")({
	validateSearch: customerListSearch,
	search: { middlewares: [stripSearchParams(customerSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(customersQuery(deps));
	},
	component: Customers,
});

function Customers() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_customers()} />
			<CustomersTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
