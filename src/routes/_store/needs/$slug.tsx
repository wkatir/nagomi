import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { LandingPage } from "#/components/store/listing/landing-page";
import { loadListing } from "#/components/store/listing/load-listing";
import { isNotFound } from "#/lib/api";
import type { Trail } from "#/lib/crumbs";
import { listingSearch } from "#/lib/listing";
import { concernQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { getLocale } from "#/paraglide/runtime";

const trailOf = (slug: string, name: string): Trail => ({
	ancestors: ["home", "shop"],
	current: { name, path: `/needs/${slug}` },
});

export const Route = createFileRoute("/_store/needs/$slug")({
	validateSearch: listingSearch.omit({ concern: true }),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		try {
			const [store, concern, list] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					concernQuery(params.slug, getLocale()),
				),
				loadListing(context.queryClient, deps, { concern: params.slug }),
			]);
			return { store, concern, items: list.items };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, concern, items } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: concern.seoTitle ?? concern.name,
				description: concern.seoDescription ?? concern.description,
				trail: trailOf(params.slug, concern.name),
				items: items.map((p) => ({
					name: `${p.brand.name} ${p.name}`,
					path: `/products/${p.slug}`,
				})),
			}),
		};
	},
	component: NeedPage,
});

function NeedPage() {
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: concern } = useSuspenseQuery(concernQuery(slug, getLocale()));
	return (
		<LandingPage
			trail={trailOf(slug, concern.name)}
			title={concern.name}
			description={concern.description}
			routines={concern.routines}
			scope={{ concern: slug }}
			search={search}
			onChange={(next) => navigate({ search: next, resetScroll: false })}
		/>
	);
}
