import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireStaffArea } from "#/lib/admin-area";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/purchases")({
	beforeLoad: requireStaffArea("purchasing"),
	staticData: { crumb: m.admin_nav_purchases },
	component: Outlet,
});
