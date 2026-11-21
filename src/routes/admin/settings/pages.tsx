import { createFileRoute } from "@tanstack/react-router";
import { PagesSection } from "#/features/settings/pages-section";
import { pagesQuery } from "#/features/settings/queries";
import { SettingsSkeleton } from "#/features/settings/settings-skeleton";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/settings/pages")({
	staticData: { crumb: m.admin_settings_tab_pages },
	loader: ({ context }) => context.queryClient.ensureQueryData(pagesQuery),
	pendingComponent: () => <SettingsSkeleton cards={2} />,
	component: PagesSection,
});
