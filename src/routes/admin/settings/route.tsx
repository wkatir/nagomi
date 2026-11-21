import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { SettingsNav } from "#/features/settings/settings-nav";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/settings")({
	staticData: { crumb: m.admin_nav_settings },
	component: SettingsLayout,
});

function SettingsLayout() {
	return (
		<>
			<PageHeader title={m.admin_nav_settings()} />
			<SettingsNav />
			<div className="max-w-3xl">
				<Outlet />
			</div>
		</>
	);
}
