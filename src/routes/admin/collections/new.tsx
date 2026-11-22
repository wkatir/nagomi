import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { NewCollectionForm } from "#/features/collections/new-collection-form";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/collections/new")({
	staticData: { crumb: m.admin_collection_new },
	loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
	component: NewCollection,
});

function NewCollection() {
	return (
		<>
			<PageHeader title={m.admin_collection_new()} />
			<NewCollectionForm />
		</>
	);
}
