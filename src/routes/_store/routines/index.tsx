import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RoutineCard } from "#/components/store/routine-card";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import type { Trail } from "#/lib/crumbs";
import { routinesQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const trail = (): Trail => ({
	ancestors: ["home"],
	current: { name: m.routines_title(), path: "/routines" },
});

export const Route = createFileRoute("/_store/routines/")({
	loader: async ({ context }) => {
		const [store, routines] = await Promise.all([
			context.queryClient.ensureQueryData(storeQuery),
			context.queryClient.ensureQueryData(routinesQuery(getLocale())),
		]);
		return { store, routines };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { store, routines } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: m.routines_title(),
				description: m.home_routines_body(),
				trail: trail(),
				items: routines.map((r) => ({
					name: r.title,
					path: `/routines/${r.slug}`,
				})),
			}),
		};
	},
	component: RoutinesPage,
});

function RoutinesPage() {
	const { data: routines } = useSuspenseQuery(routinesQuery(getLocale()));
	return (
		<div className="container-page py-section-sm">
			<StoreBreadcrumb trail={trail()} className="-mt-3" />
			<h1 className="mt-2 type-h1 text-balance">{m.routines_title()}</h1>
			<p className="mt-4 max-w-[62ch] type-lead text-foreground-secondary">
				{m.home_routines_body()}
			</p>
			{routines.length > 0 ? (
				<ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
					{routines.map((routine) => (
						<li key={routine.slug}>
							<RoutineCard routine={routine} />
						</li>
					))}
				</ul>
			) : (
				<EmptyState title={m.routines_empty()} className="mt-10" />
			)}
		</div>
	);
}
