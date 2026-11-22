import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CustomersCard } from "#/features/settings/customers-form";
import { IdentityCard } from "#/features/settings/identity-form";
import { LegalCard } from "#/features/settings/legal-form";
import { OperationsCard } from "#/features/settings/operations-form";
import { SettingsSkeleton } from "#/features/settings/settings-skeleton";
import { SocialCard } from "#/features/settings/social-form";
import { adminSettingsQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/settings/store")({
	staticData: { crumb: m.admin_settings_tab_store },
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(adminSettingsQuery),
	pendingComponent: () => <SettingsSkeleton cards={5} />,
	component: StoreSettings,
});

function StoreSettings() {
	const { data: settings } = useSuspenseQuery(adminSettingsQuery);
	return (
		<div className="grid gap-admin-stack">
			<IdentityCard settings={settings} />
			<OperationsCard settings={settings} />
			<CustomersCard settings={settings} />
			<LegalCard settings={settings} />
			<SocialCard settings={settings} />
		</div>
	);
}
