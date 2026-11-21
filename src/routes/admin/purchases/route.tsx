import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/purchases")({
	staticData: { crumb: m.admin_nav_purchases },
	component: Outlet,
});
