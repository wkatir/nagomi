import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { CollectionEditor } from "#/features/collections/collection-editor";
import { collectionQuery } from "#/features/collections/queries";
import { isNotFound } from "#/lib/api";
import { adminSettingsQuery } from "#/lib/queries";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/collections/$id")({
	params: {
		parse: ({ id }) => {
			const parsed = Number(id);
			if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
			return { id: parsed };
		},
		stringify: ({ id }) => ({ id: String(id) }),
	},
	// The store's principal language is loaded with the collection: the editor needs it to open.
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [collection, settings] = await Promise.all([
				context.queryClient.ensureQueryData(collectionQuery(params.id)),
				context.queryClient.ensureQueryData(adminSettingsQuery),
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
