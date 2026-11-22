import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { CategoriesTable } from "#/features/categories/categories-table";
import { categoriesQuery } from "#/features/categories/queries";
import { storeQuery } from "#/lib/queries";
import { categoryListSearch } from "#/lib/schemas/categories";
import { m } from "#/paraglide/messages";

const defaults = categoryListSearch.parse({});

export const Route = createFileRoute("/admin/categories")({
	staticData: { crumb: m.admin_nav_categories },
	validateSearch: categoryListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// The table is not awaited, so paging keeps the page on screen; prefetchQuery never rejects.
	loader: async ({ context, deps }) => {
		void context.queryClient.prefetchQuery(categoriesQuery(deps));
		await context.queryClient.ensureQueryData(storeQuery);
	},
	component: Categories,
});

function Categories() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_categories()} />
			<CategoriesTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
