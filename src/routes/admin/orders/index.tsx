import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { OrdersTable } from "#/features/orders/orders-table";
import { ordersQuery } from "#/features/orders/queries";
import { orderSearchDefaults } from "#/features/orders/search";
import { orderListSearch } from "#/lib/schemas/orders";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders/")({
	validateSearch: orderListSearch,
	search: { middlewares: [stripSearchParams(orderSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(ordersQuery(deps));
	},
	component: Orders,
});

function Orders() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_orders()} />
			<OrdersTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
