import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { NewBundleForm } from "#/features/bundles/new-bundle-form";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/bundles/new")({
	staticData: { crumb: m.admin_routine_new },
	// The form reads the store's principal language: it is small and kept.
	loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
	component: NewBundle,
});

function NewBundle() {
	return (
		<>
			<PageHeader title={m.admin_routine_new()} />
			<NewBundleForm />
		</>
	);
}
