import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { BundleEditor } from "#/features/bundles/bundle-editor";
import { bundleQuery } from "#/features/bundles/queries";
import { isNotFound } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/bundles/$id")({
	params: {
		parse: ({ id }) => {
			const parsed = Number(id);
			if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
			return { id: parsed };
		},
		stringify: ({ id }) => ({ id: String(id) }),
	},
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [bundle, settings] = await Promise.all([
				context.queryClient.ensureQueryData(bundleQuery(params.id)),
				context.queryClient.ensureQueryData(storeQuery),
			]);
			const title = bundle.translations.find(
				(t) => t.locale === settings.defaultLocale,
			);
			return { crumb: title?.name ?? bundle.slug };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => <RecordNotFound listLabel={m.admin_nav_bundles()} />,
	component: Bundle,
});

function Bundle() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(bundleQuery(id));
	return <BundleEditor bundle={data} />;
}
