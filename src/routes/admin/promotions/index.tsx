import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { PromotionsTable } from "#/features/promotions/promotions-table";
import { promotionsQuery } from "#/features/promotions/queries";
import { promotionSearchDefaults } from "#/features/promotions/search";
import { promotionListSearch } from "#/lib/schemas/promotions";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/promotions/")({
	validateSearch: promotionListSearch,
	search: { middlewares: [stripSearchParams(promotionSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(promotionsQuery(deps));
	},
	component: Promotions,
});

function Promotions() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_promotions()} />
			<PromotionsTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
