import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/audit")({
	staticData: { crumb: m.admin_nav_audit },
	component: Outlet,
});
