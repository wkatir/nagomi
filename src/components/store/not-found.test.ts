import { describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	notFound,
} from "@tanstack/react-router";
import { testStore } from "#/test/store-fixture";

const origin = "https://shop.example";
mock.module("cloudflare:workers", () => ({
	env: { BETTER_AUTH_URL: origin },
}));
// Nothing renders here, so the store frame is a stub: its imports (cart, API client) would
// otherwise depend on module mocks other test files install for the whole run.
mock.module("#/components/store/store-frame", () => ({
	StoreFrame: () => null,
}));
const { navigationQuery, storeQuery } = await import("#/lib/queries");
const { getLocale } = await import("#/paraglide/runtime");
const { Route: StoreRoute } = await import("#/routes/_store/route");
const { Route: UnknownRoute } = await import("#/routes/_store/$");

// The store layout and the catch-all route mounted as routeTree.gen.ts mounts them, plus a
// home page and a product page whose loader refuses an unknown slug like the real one.
const root = createRootRouteWithContext<{ queryClient: QueryClient }>()();
const store = StoreRoute.update({
	id: "/_store",
	getParentRoute: () => root,
} as never);
const routeTree = root.addChildren([
	store.addChildren([
		createRoute({ getParentRoute: () => store, path: "/" }),
		createRoute({
			getParentRoute: () => store,
			path: "products/$slug",
			loader: ({ params }) => {
				if (params.slug === "missing") throw notFound();
			},
		}),
		UnknownRoute.update({
			id: "/$",
			path: "/$",
			getParentRoute: () => store,
		} as never),
	]),
]);

async function render(path: string) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, testStore);
	queryClient.setQueryData(navigationQuery(getLocale()).queryKey, {
		categories: [],
		brands: [],
		collections: [],
	});
	const router = createRouter({
		routeTree,
		context: { queryClient },
		history: createMemoryHistory({ initialEntries: [path] }),
		isServer: true,
	});
	await router.load();
	const result = router._serverResult;
	if (result?.type !== "render") throw new Error(`${path} did not render`);
	const layout = result.matches.find((x) => x.routeId === "/_store");
	if (!layout) throw new Error(`${path} is outside the store layout`);
	return { status: result.status, layout };
}

describe("store 404", () => {
	// The layout's notFoundComponent replaces the layout and draws the store frame itself.
	test.each([
		["an unknown address", "/no-such-page"],
		["an unknown nested address", "/products/keyboard/extra"],
		["a product that does not exist", "/products/missing"],
	])("%s is the store's 404, titled and out of search results", async (_, path) => {
		const { status, layout } = await render(path);
		expect(status).toBe(404);
		expect(layout.status).toBe("notFound");
		expect(layout.meta).toEqual([
			{ title: "Página no encontrada | Nagomi" },
			{ name: "robots", content: "noindex" },
		]);
		expect(layout.links).toBeUndefined();
	});

	test("an existing page keeps the store layout and its head", async () => {
		const { status, layout } = await render("/products/keyboard");
		expect(status).toBe(200);
		expect(layout.status).toBe("success");
		expect(layout.links).toContainEqual({
			rel: "canonical",
			href: `${origin}/products/keyboard`,
		});
	});
});
