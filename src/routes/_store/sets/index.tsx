import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BundleCard } from "#/components/store/bundle-card";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import type { Trail } from "#/lib/crumbs";
import { bundlesQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const trail = (): Trail => ({
	ancestors: ["home"],
	current: { name: m.bundles_title(), path: "/sets" },
});

export const Route = createFileRoute("/_store/sets/")({
	loader: async ({ context }) => {
		const [store, bundles] = await Promise.all([
			context.queryClient.ensureQueryData(storeQuery),
			context.queryClient.ensureQueryData(bundlesQuery(getLocale())),
		]);
		return { store, bundles };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { store, bundles } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: m.bundles_title(),
				description: m.bundles_body(),
				trail: trail(),
				items: bundles.map((b) => ({
					name: b.name,
					path: `/sets/${b.slug}`,
				})),
			}),
		};
	},
	component: BundlesPage,
});

function BundlesPage() {
	const { data: bundles } = useSuspenseQuery(bundlesQuery(getLocale()));
	return (
		<div className="container-page py-section-sm">
			<StoreBreadcrumb trail={trail()} className="-mt-3" />
			<h1 className="mt-2 type-h1 text-balance">{m.bundles_title()}</h1>
			<p className="mt-4 max-w-[62ch] type-lead text-foreground-secondary">
				{m.bundles_body()}
			</p>
			{bundles.length > 0 ? (
				<ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
					{bundles.map((bundle) => (
						<li key={bundle.slug}>
							<BundleCard bundle={bundle} />
						</li>
					))}
				</ul>
			) : (
				<EmptyState title={m.bundles_empty()} className="mt-10" />
			)}
		</div>
	);
}
