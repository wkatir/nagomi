import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/shipping")({
	staticData: { crumb: m.admin_nav_shipping },
	component: Outlet,
});
