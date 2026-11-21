import { createFileRoute, Outlet } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/products")({
	staticData: { crumb: m.admin_nav_products },
	component: Outlet,
});
