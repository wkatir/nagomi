import { Link, useRouterState } from "@tanstack/react-router";
import { PageTab, PageTabs } from "#/components/admin/page-tabs";
import { m } from "#/paraglide/messages";

const TABS = [
	{ to: "/admin/inventory", label: m.admin_inventory_tab_stock },
	{ to: "/admin/inventory/lots", label: m.admin_inventory_tab_lots },
	{ to: "/admin/inventory/movements", label: m.admin_inventory_tab_movements },
	{ to: "/admin/inventory/reorder", label: m.admin_inventory_tab_reorder },
] as const;

export function InventoryTabs() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const current = TABS.find((tab) => tab.to === pathname)?.to ?? TABS[0].to;
	return (
		<PageTabs value={current} label={m.admin_inventory_tabs_label()}>
			{TABS.map((tab) => (
				<PageTab key={tab.to} value={tab.to} asChild>
					<Link to={tab.to}>{tab.label()}</Link>
				</PageTab>
			))}
		</PageTabs>
	);
}
