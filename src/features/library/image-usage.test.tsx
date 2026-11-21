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
import { UsageList } from "./image-usage";
import type { MediaUsage } from "./queries";

// The list needs a router to link the slides; a root with the slide route is all it asks.
async function render(usage: MediaUsage) {
	const root = createRootRoute();
	const slide = createRoute({
		getParentRoute: () => root,
		path: "/admin/slides/$id",
	});
	const index = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => <UsageList usage={usage} />,
	});
	const router = createRouter({
		routeTree: root.addChildren([index, slide]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

const empty: MediaUsage = { slides: [], collections: [], photos: [] };

describe("UsageList", () => {
	test("says so when nothing uses the image", async () => {
		const html = await render(empty);
		expect(html).toContain(m.admin_library_unused());
		expect(html).not.toContain("<h3");
	});

	test("shows a group only when it has something", async () => {
		const html = await render({
			...empty,
			collections: [
				{ id: 1, slug: "essentials", status: "published", title: null },
			],
		});
		expect(html).toContain(m.admin_library_used_covers());
		expect(html).not.toContain(m.admin_library_used_slides());
		expect(html).not.toContain(m.admin_library_used_photos());
		expect(html).not.toContain(m.admin_library_unused());
	});

	test("links a slide to its page and says which picture it is", async () => {
		const html = await render({
			...empty,
			slides: [
				{
					id: 7,
					status: "published",
					title: "Hello",
					desktop: true,
					mobile: true,
				},
				{
					id: 8,
					status: "draft",
					title: null,
					desktop: false,
					mobile: true,
				},
			],
		});
		expect(html).toContain('href="/admin/slides/7"');
		expect(html).toContain("Hello");
		expect(html).toContain(
			`${m.admin_library_as_desktop()}, ${m.admin_library_as_mobile()}`,
		);
		expect(html).toContain('href="/admin/slides/8"');
		expect(html).toContain(m.admin_slide_untitled());
	});

	test("names collections and products by their text, or their identifier without it", async () => {
		const html = await render({
			...empty,
			collections: [
				{ id: 1, slug: "essentials", status: "draft", title: "Esenciales" },
			],
			photos: [
				{ id: 1, productId: 1, slug: "oil", status: "active", name: "Aceite" },
				{ id: 2, productId: 2, slug: "cream", status: "archived", name: null },
			],
		});
		expect(html).toContain("Esenciales");
		expect(html).toContain("Aceite");
		expect(html).toContain("cream");
	});

	test("marks an archived photo and no other", async () => {
		const html = await render({
			...empty,
			photos: [
				{ id: 1, productId: 1, slug: "oil", status: "active", name: "Aceite" },
				{ id: 2, productId: 2, slug: "cream", status: "archived", name: null },
			],
		});
		expect(html.split(m.admin_library_photo_archived())).toHaveLength(2);
	});
});
