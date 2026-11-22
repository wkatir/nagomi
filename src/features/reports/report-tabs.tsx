import { Link, useRouterState } from "@tanstack/react-router";
import { PageTab, PageTabs } from "#/components/admin/page-tabs";
import { m } from "#/paraglide/messages";

const TABS = [
	{ to: "/admin/reports", label: m.admin_report_sales },
	{ to: "/admin/reports/products", label: m.admin_report_products },
	{ to: "/admin/reports/brands", label: m.admin_report_brands },
	{ to: "/admin/reports/stock", label: m.admin_report_stock },
	{ to: "/admin/reports/customers", label: m.admin_report_customers },
	{ to: "/admin/reports/fulfillment", label: m.admin_report_fulfillment },
	{ to: "/admin/reports/losses", label: m.admin_report_losses },
	{ to: "/admin/reports/reorder", label: m.admin_report_reorder },
] as const;

// The chosen days follow the user across tabs; the reorder report ignores them.
export function ReportTabs({ days }: { days: { from?: string; to?: string } }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const current = TABS.find((tab) => tab.to === pathname)?.to;
	return (
		<PageTabs value={current ?? ""}>
			{TABS.map((tab) => (
				<PageTab key={tab.to} value={tab.to} asChild>
					<Link to={tab.to} search={days}>
						{tab.label()}
					</Link>
				</PageTab>
			))}
		</PageTabs>
	);
}
