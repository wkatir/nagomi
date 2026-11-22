import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { CollectionEditor } from "#/features/collections/collection-editor";
import { collectionQuery } from "#/features/collections/queries";
import { isNotFound } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { idParams, type LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/collections/$id")({
	params: idParams,
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [collection, settings] = await Promise.all([
				context.queryClient.ensureQueryData(collectionQuery(params.id)),
				context.queryClient.ensureQueryData(storeQuery),
			]);
			const title = collection.translations.find(
				(t) => t.locale === settings.defaultLocale,
			);
			return { crumb: title?.title ?? collection.slug };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => (
		<RecordNotFound listLabel={m.admin_nav_collections()} />
	),
	component: Collection,
});

function Collection() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(collectionQuery(id));
	return <CollectionEditor collection={data} />;
}
