import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { InvoicingSettings } from "#/features/invoices/invoicing-settings";
import { invoiceConnectionQuery } from "#/features/invoices/queries";
import { SettingsSkeleton } from "#/features/settings/settings-skeleton";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/settings/invoicing")({
	staticData: { crumb: m.admin_settings_tab_invoicing },
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(invoiceConnectionQuery),
	pendingComponent: () => <SettingsSkeleton cards={1} />,
	component: Invoicing,
});

function Invoicing() {
	const { data } = useSuspenseQuery(invoiceConnectionQuery);
	return <InvoicingSettings connection={data} />;
}
