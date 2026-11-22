import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { stockQuery, stockSummaryQuery } from "#/features/inventory/queries";
import { stockSearchDefaults } from "#/features/inventory/search";
import { StockTable } from "#/features/inventory/stock-table";
import { stockListSearch } from "#/lib/schemas/inventory";

export const Route = createFileRoute("/admin/inventory/")({
	validateSearch: stockListSearch,
	search: { middlewares: [stripSearchParams(stockSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(stockSummaryQuery);
		void context.queryClient.prefetchQuery(stockQuery(deps));
	},
	component: Stock,
});

function Stock() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<StockTable
			search={search}
			onSearchChange={(change) =>
				navigate({ search: (previous) => ({ ...previous, ...change }) })
			}
		/>
	);
}
