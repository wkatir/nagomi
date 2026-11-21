import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PaymentsCard } from "#/features/settings/payments-form";
import { SettingsSkeleton } from "#/features/settings/settings-skeleton";
import { adminSettingsQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/settings/payments")({
	staticData: { crumb: m.admin_settings_tab_payments },
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(adminSettingsQuery),
	pendingComponent: () => <SettingsSkeleton cards={1} />,
	component: Payments,
});

function Payments() {
	const { data: settings } = useSuspenseQuery(adminSettingsQuery);
	return <PaymentsCard settings={settings} />;
}
