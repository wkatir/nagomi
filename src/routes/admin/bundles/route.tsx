import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/bundles")({
	staticData: { crumb: m.admin_nav_bundles },
	component: Outlet,
});
