import { createFileRoute } from "@tanstack/react-router";
import { Search, Store } from "lucide-react";
import { LandingPage } from "#/components/store/listing/landing-page";
import { loadListing } from "#/components/store/listing/load-listing";
import { listingSearch } from "#/lib/listing";
import { storeQuery } from "#/lib/queries";
import { pageMeta } from "#/lib/seo";
import { m } from "#/paraglide/messages";

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
	const title = search.q ? m.shop_results({ q: search.q }) : m.shop_all_title();
	return (
		<LandingPage
			trail={{
				ancestors: ["home"],
				current: { name: title, path: "/products" },
			}}
			title={title}
			description={search.q ? null : m.shop_all_body()}
			icon={search.q ? Search : Store}
			search={search}
			onChange={(next) => navigate({ search: next, resetScroll: false })}
		/>
	);
}
