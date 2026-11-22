import { Link, useRouterState } from "@tanstack/react-router";
import { isNavActive } from "#/components/admin/nav";
import { PageTab, PageTabs } from "#/components/admin/page-tabs";
import { m } from "#/paraglide/messages";

const SECTIONS = [
	{ to: "/admin/settings/store", label: m.admin_settings_tab_store },
	{ to: "/admin/settings/payments", label: m.admin_settings_tab_payments },
	{ to: "/admin/settings/promises", label: m.admin_settings_tab_promises },
	{ to: "/admin/settings/pages", label: m.admin_settings_tab_pages },
] as const;

export function SettingsNav() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const current = SECTIONS.find((section) => isNavActive(section.to, pathname));
	return (
		<PageTabs value={current?.to ?? ""}>
			{SECTIONS.map((section) => (
				<PageTab key={section.to} value={section.to} asChild>
					<Link to={section.to}>{section.label()}</Link>
				</PageTab>
			))}
		</PageTabs>
	);
}
