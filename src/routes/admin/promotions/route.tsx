import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/promotions")({
	staticData: { crumb: m.admin_nav_promotions },
	component: Outlet,
});
