import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireStaffArea } from "#/lib/admin-area";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/audit")({
	beforeLoad: requireStaffArea("audit"),
	staticData: { crumb: m.admin_nav_audit },
	component: Outlet,
});
