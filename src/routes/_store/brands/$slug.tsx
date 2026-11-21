import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { LandingPage } from "#/components/store/listing/landing-page";
import { loadListing } from "#/components/store/listing/load-listing";
import { isNotFound } from "#/lib/api";
import type { Trail } from "#/lib/crumbs";
import { listingSearch } from "#/lib/listing";
import { brandQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { getLocale } from "#/paraglide/runtime";

const trailOf = (slug: string, name: string): Trail => ({
	ancestors: ["home", "shop"],
	current: { name, path: `/brands/${slug}` },
});

export const Route = createFileRoute("/_store/brands/$slug")({
	validateSearch: listingSearch.omit({ brand: true }),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		try {
			const [store, brand, list] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					brandQuery(params.slug, getLocale()),
				),
				loadListing(context.queryClient, deps, { brand: params.slug }),
			]);
			return { store, brand, items: list.items };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, brand, items } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: brand.seoTitle ?? brand.name,
				description: brand.seoDescription ?? brand.description,
				trail: trailOf(params.slug, brand.name),
				items: items.map((p) => ({
					name: `${p.brand.name} ${p.name}`,
					path: `/products/${p.slug}`,
				})),
			}),
		};
	},
	component: BrandPage,
});

function BrandPage() {
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: brand } = useSuspenseQuery(brandQuery(slug, getLocale()));
	return (
		<LandingPage
			trail={trailOf(slug, brand.name)}
			title={brand.name}
			description={brand.description}
			scope={{ brand: slug }}
			search={search}
			onChange={(next) => navigate({ search: next, resetScroll: false })}
		/>
	);
}
