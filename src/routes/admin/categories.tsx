import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { CategoriesTable } from "#/features/categories/categories-table";
import { categoriesQuery } from "#/features/categories/queries";
import { adminSettingsQuery } from "#/lib/queries";
import { categoryListSearch } from "#/lib/schemas/categories";
import { m } from "#/paraglide/messages";

const defaults = categoryListSearch.parse({});

export const Route = createFileRoute("/admin/categories")({
	staticData: { crumb: m.admin_nav_categories },
	validateSearch: categoryListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// The table has its own loading state, and paging or filtering should keep the page on
	// screen: its query is started, not awaited (prefetchQuery never rejects; a failure shows in
	// the table). The settings the dialog needs are small and kept.
	loader: async ({ context, deps }) => {
		void context.queryClient.prefetchQuery(categoriesQuery(deps));
		await context.queryClient.ensureQueryData(adminSettingsQuery);
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
