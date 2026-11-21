import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/collections")({
	staticData: { crumb: m.admin_nav_collections },
	component: Outlet,
});
