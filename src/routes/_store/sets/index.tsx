import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { BundleCard } from "#/components/store/bundle-card";
import { EmptyState } from "#/components/store/ui/empty-state";
import { PageHeader } from "#/components/store/ui/page-header";
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
		<div className="container-page pt-4 md:pt-6">
			<StoreBreadcrumb trail={trail()} />
			<PageHeader
				title={m.bundles_title()}
				description={m.bundles_body()}
				icon={Boxes}
				className="mt-2 mb-6"
			/>
			{bundles.length > 0 ? (
				<ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{bundles.map((bundle) => (
						<li key={bundle.slug} className="flex">
							<BundleCard bundle={bundle} headingLevel={2} className="w-full" />
						</li>
					))}
				</ul>
			) : (
				<EmptyState title={m.bundles_empty()} />
			)}
		</div>
	);
}
