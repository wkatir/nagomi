import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders")({
	staticData: { crumb: m.admin_nav_orders },
	component: Outlet,
});
