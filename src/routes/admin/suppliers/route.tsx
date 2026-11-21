import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/suppliers")({
	staticData: { crumb: m.admin_nav_suppliers },
	component: Outlet,
});
