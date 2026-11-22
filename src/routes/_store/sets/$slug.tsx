import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { BundleCard } from "#/components/store/bundle-card";
import { ProductCard } from "#/components/store/product-card";
import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import { isNotFound } from "#/lib/api";
import type { Trail } from "#/lib/crumbs";
import { bundleQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const trailOf = (slug: string, name: string): Trail => ({
	ancestors: ["home", "bundles"],
	current: { name, path: `/sets/${slug}` },
});

export const Route = createFileRoute("/_store/sets/$slug")({
	loader: async ({ context, params }) => {
		try {
			const [store, bundle] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					bundleQuery(params.slug, getLocale()),
				),
			]);
			return { store, bundle };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, bundle } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: bundle.seoTitle ?? bundle.name,
				description: bundle.seoDescription ?? bundle.description,
				trail: trailOf(params.slug, bundle.name),
				items: bundle.items.map((i) => ({
					name: `${i.product.brand.name} ${i.product.name}`,
					path: `/products/${i.product.slug}`,
				})),
			}),
		};
	},
	component: BundlePage,
});

function BundlePage() {
	const { slug } = Route.useParams();
	const { data: bundle } = useSuspenseQuery(bundleQuery(slug, getLocale()));
	return (
		<div className="container-page py-section-sm">
			<StoreBreadcrumb trail={trailOf(slug, bundle.name)} className="-mt-3" />
			<h1 className="mt-2 type-h1 text-balance">{bundle.name}</h1>
			{bundle.description && (
				<p className="mt-4 max-w-[62ch] type-lead text-foreground-secondary">
					{bundle.description}
				</p>
			)}
			<div className="mt-10 max-w-xl">
				<BundleCard bundle={bundle} headingLevel={2} />
			</div>
			<section
				aria-labelledby="bundle-products-title"
				className="mt-section-sm"
			>
				<SectionHeading
					id="bundle-products-title"
					title={m.bundle_products_title()}
				/>
				<div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-5 md:gap-y-12 lg:grid-cols-4">
					{bundle.items.map((item) => (
						<ProductCard
							key={item.sku}
							product={item.product}
							headingLevel={3}
						/>
					))}
				</div>
			</section>
		</div>
	);
}
