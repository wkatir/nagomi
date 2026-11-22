import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { InventoryTabs } from "#/features/inventory/inventory-tabs";
import { requireStaffArea } from "#/lib/admin-area";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/inventory")({
	beforeLoad: requireStaffArea("inventory"),
	staticData: { crumb: m.admin_nav_inventory },
	component: Inventory,
});

function Inventory() {
	return (
		<>
			<PageHeader title={m.admin_nav_inventory()} />
			<InventoryTabs />
			<Outlet />
		</>
	);
}
