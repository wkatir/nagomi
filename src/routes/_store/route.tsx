import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StoreNotFound } from "#/components/store/not-found";
import { StoreFrame } from "#/components/store/store-frame";
import { pageTitle } from "#/lib/head";
import { navigationQuery, storeQuery } from "#/lib/queries";
import { isNoindex, pagePath, storeHead } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store")({
	loader: async ({ context }) => {
		const [store] = await Promise.all([
			context.queryClient.ensureQueryData(storeQuery),
			context.queryClient.ensureQueryData(navigationQuery(getLocale())),
		]);
		return store;
	},
	head: ({ loaderData, match, matches }) => {
		if (!loaderData) return {};
		if (match.status === "notFound")
			return {
				meta: [
					pageTitle(m.not_found_meta_title(), loaderData.name),
					{ name: "robots", content: "noindex" },
				],
			};
		return storeHead({
			origin: siteOrigin(),
			locale: getLocale(),
			path: pagePath(matches),
			noindex: isNoindex(matches),
			store: loaderData,
			title: `${loaderData.name} | ${m.meta_title()}`,
			description: m.meta_description({ store: loaderData.name }),
		});
	},
	component: StoreLayout,
	// The router renders this in place of StoreLayout for a notFound() thrown below this
	// route, so it draws the store frame itself.
	notFoundComponent: StoreNotFoundPage,
});

function StoreLayout() {
	return (
		<StoreFrame>
			<Outlet />
		</StoreFrame>
	);
}

function StoreNotFoundPage() {
	return (
		<StoreFrame>
			<StoreNotFound />
		</StoreFrame>
	);
}
