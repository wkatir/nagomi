import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireStaffArea } from "#/lib/admin-area";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/slides")({
	beforeLoad: requireStaffArea("merchandising"),
	staticData: { crumb: m.admin_nav_slides },
	component: Outlet,
});
