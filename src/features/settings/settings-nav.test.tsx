import { describe, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { m } from "#/paraglide/messages";
import { SettingsNav } from "./settings-nav";

const PATHS = [
	"/admin/settings/store",
	"/admin/settings/payments",
	"/admin/settings/promises",
	"/admin/settings/pages",
	"/admin/settings/invoicing",
];

async function renderAt(path: string) {
	const root = createRootRoute({ component: SettingsNav });
	const sections = PATHS.map((to) =>
		createRoute({ getParentRoute: () => root, path: to }),
	);
	const router = createRouter({
		routeTree: root.addChildren(sections),
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

const link = (html: string, to: string) => {
	const at = html.indexOf(`href="${to}"`);
	if (at === -1) throw new Error(`No link to ${to}`);
	return html.slice(html.lastIndexOf("<a", at), html.indexOf(">", at));
};

describe("SettingsNav", () => {
	test("links to the five sections, in order", async () => {
		const html = await renderAt("/admin/settings/store");
		const labels = [
			m.admin_settings_tab_store(),
			m.admin_settings_tab_payments(),
			m.admin_settings_tab_promises(),
			m.admin_settings_tab_pages(),
			m.admin_settings_tab_invoicing(),
		];
		const positions = labels.map((label) => html.indexOf(`>${label}</a>`));
		expect(positions.every((at) => at > -1)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		for (const to of PATHS) expect(link(html, to)).toContain("<a");
	});

	test("marks the section it is on and no other", async () => {
		for (const [at, current] of PATHS.entries()) {
			const html = await renderAt(current);
			const selected = PATHS.filter((to) =>
				link(html, to).includes('aria-selected="true"'),
			);
			expect(selected).toEqual([PATHS[at]]);
		}
	});
});
