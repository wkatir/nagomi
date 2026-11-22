import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { NewBundleForm } from "#/features/bundles/new-bundle-form";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/bundles/new")({
	staticData: { crumb: m.admin_bundle_new },
	loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
	component: NewBundle,
});

function NewBundle() {
	return (
		<>
			<PageHeader title={m.admin_bundle_new()} />
			<NewBundleForm />
		</>
	);
}
