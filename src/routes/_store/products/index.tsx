import { createFileRoute } from "@tanstack/react-router";
import { loadListing } from "#/components/store/listing/load-listing";
import { ProductListing } from "#/components/store/listing/product-listing";
import { listingSearch } from "#/lib/listing";
import { storeQuery } from "#/lib/queries";
import { pageMeta } from "#/lib/seo";
import { m } from "#/paraglide/messages";

// The choices live in the URL, so a list can be shared. `q` is the search the WebSite
// structured data advertises (src/lib/seo.ts).
export const Route = createFileRoute("/_store/products/")({
	validateSearch: listingSearch,
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const [store] = await Promise.all([
			context.queryClient.ensureQueryData(storeQuery),
			loadListing(context.queryClient, deps),
		]);
		return { storeName: store.name };
	},
	head: ({ loaderData, match }) => ({
		meta: loaderData
			? pageMeta({
					title: match.search.q
						? m.shop_results({ q: match.search.q })
						: m.shop_title(),
					storeName: loaderData.storeName,
				})
			: [],
	}),
	component: Shop,
});

function Shop() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<div className="container-page py-section-sm">
			<h1 className="type-h1 text-balance">
				{search.q ? m.shop_results({ q: search.q }) : m.shop_title()}
			</h1>
			<div className="mt-8">
				<ProductListing
					search={search}
					onChange={(next) => navigate({ search: next, resetScroll: false })}
				/>
			</div>
		</div>
	);
}
