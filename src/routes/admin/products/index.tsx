import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { productOptionsQuery } from "#/features/products/options";
import { ProductsTable } from "#/features/products/products-table";
import { productsQuery } from "#/features/products/queries";
import { productSearchDefaults } from "#/features/products/search";
import { productListSearch } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/products/")({
	validateSearch: productListSearch,
	search: { middlewares: [stripSearchParams(productSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(productsQuery(deps));
		void context.queryClient.prefetchQuery(productOptionsQuery);
	},
	component: Products,
});

function Products() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_products()} />
			<ProductsTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
