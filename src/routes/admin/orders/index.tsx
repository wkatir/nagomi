import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import {
	FollowupDigestLoader,
	followupsQuery,
} from "#/features/orders/followups";
import { OrdersTable } from "#/features/orders/orders-table";
import { ordersQuery } from "#/features/orders/queries";
import { orderSearchDefaults } from "#/features/orders/search";
import { orderListSearch } from "#/lib/schemas/orders";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders/")({
	validateSearch: orderListSearch,
	search: { middlewares: [stripSearchParams(orderSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(ordersQuery(deps));
		void context.queryClient.prefetchQuery(followupsQuery);
	},
	component: Orders,
});

function Orders() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_orders()} />
			<div className="mb-admin-section">
				<FollowupDigestLoader />
			</div>
			<OrdersTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
