import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { LandingPage } from "#/components/store/listing/landing-page";
import { loadListing } from "#/components/store/listing/load-listing";
import { isNotFound } from "#/lib/api";
import type { Trail } from "#/lib/crumbs";
import { listingSearch } from "#/lib/listing";
import { categoryQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { getLocale } from "#/paraglide/runtime";

const trailOf = (slug: string, name: string): Trail => ({
	ancestors: ["home", "shop"],
	current: { name, path: `/categories/${slug}` },
});

export const Route = createFileRoute("/_store/categories/$slug")({
	validateSearch: listingSearch.omit({ category: true }),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		try {
			const [store, category, list] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					categoryQuery(params.slug, getLocale()),
				),
				loadListing(context.queryClient, deps, { category: params.slug }),
			]);
			return { store, category, items: list.items };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, category, items } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: category.seoTitle ?? category.name,
				description: category.seoDescription ?? category.description,
				trail: trailOf(params.slug, category.name),
				items: items.map((p) => ({
					name: `${p.brand.name} ${p.name}`,
					path: `/products/${p.slug}`,
				})),
			}),
		};
	},
	component: CategoryPage,
});

function CategoryPage() {
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: category } = useSuspenseQuery(categoryQuery(slug, getLocale()));
	return (
		<LandingPage
			trail={trailOf(slug, category.name)}
			title={category.name}
			description={category.description}
			scope={{ category: slug }}
			search={search}
			onChange={(next) => navigate({ search: next, resetScroll: false })}
		/>
	);
}
