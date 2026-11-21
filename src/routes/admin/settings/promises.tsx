import { createFileRoute } from "@tanstack/react-router";
import { PromisesSection } from "#/features/settings/promises-section";
import { promisesQuery } from "#/features/settings/queries";
import { SettingsSkeleton } from "#/features/settings/settings-skeleton";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/settings/promises")({
	staticData: { crumb: m.admin_settings_tab_promises },
	loader: ({ context }) => context.queryClient.ensureQueryData(promisesQuery),
	pendingComponent: () => <SettingsSkeleton cards={3} />,
	component: PromisesSection,
});
