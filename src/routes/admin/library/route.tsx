import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/library")({
	staticData: { crumb: m.admin_nav_library },
	component: Outlet,
});
