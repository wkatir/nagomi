import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import {
	StockAlerts,
	stockAlertsQuery,
} from "#/features/engagement/admin-engagement";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/stock-alerts")({
	staticData: { crumb: m.admin_nav_stock_alerts },
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(stockAlertsQuery);
	},
	component: () => (
		<>
			<PageHeader title={m.admin_nav_stock_alerts()} />
			<StockAlerts />
		</>
	),
});
