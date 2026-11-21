import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductCard } from "#/components/store/product-card";
import { RoutineCard } from "#/components/store/routine-card";
import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import { isNotFound } from "#/lib/api";
import type { Trail } from "#/lib/crumbs";
import { routineQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const trailOf = (slug: string, title: string): Trail => ({
	ancestors: ["home", "routines"],
	current: { name: title, path: `/routines/${slug}` },
});

export const Route = createFileRoute("/_store/routines/$slug")({
	loader: async ({ context, params }) => {
		try {
			const [store, routine] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					routineQuery(params.slug, getLocale()),
				),
			]);
			return { store, routine };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, routine } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: routine.seoTitle ?? routine.title,
				description: routine.seoDescription ?? routine.description,
				trail: trailOf(params.slug, routine.title),
				items: routine.steps.map((s) => ({
					name: `${s.product.brand.name} ${s.product.name}`,
					path: `/products/${s.product.slug}`,
				})),
			}),
		};
	},
	component: RoutinePage,
});

function RoutinePage() {
	const { slug } = Route.useParams();
	const { data: routine } = useSuspenseQuery(routineQuery(slug, getLocale()));
	return (
		<div className="container-page py-section-sm">
			<StoreBreadcrumb trail={trailOf(slug, routine.title)} className="-mt-3" />
			<h1 className="mt-2 type-h1 text-balance">{routine.title}</h1>
			{routine.description && (
				<p className="mt-4 max-w-[62ch] type-lead text-foreground-secondary">
					{routine.description}
				</p>
			)}
			<div className="mt-10 max-w-xl">
				<RoutineCard routine={routine} />
			</div>
			<section
				aria-labelledby="routine-products-title"
				className="mt-section-sm"
			>
				<SectionHeading
					id="routine-products-title"
					title={m.routines_products_title()}
				/>
				<div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-5 md:gap-y-12 lg:grid-cols-4">
					{routine.steps.map((step) => (
						<ProductCard
							key={step.sku}
							product={step.product}
							headingLevel={3}
						/>
					))}
				</div>
			</section>
		</div>
	);
}
