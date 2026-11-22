import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterContextProvider,
} from "@tanstack/react-router";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffAccessProvider } from "#/components/admin/staff-access";
import { storeQuery } from "#/lib/queries";
import { testStore } from "#/test/store-fixture";
import { productOptionsQuery } from "./options";

const store = { ...testStore, checkoutOpen: true };

const options = {
	brands: [
		{ value: "1", label: "Marca Uno", archived: false },
		{ value: "2", label: "Old brand", archived: true },
	],
	categories: [{ value: "1", label: "Teclados", archived: false }],
};

const root = createRootRoute({ component: Outlet });
const router = createRouter({
	routeTree: root.addChildren([
		createRoute({ getParentRoute: () => root, path: "/admin/products" }),
		createRoute({ getParentRoute: () => root, path: "/admin/products/new" }),
		createRoute({ getParentRoute: () => root, path: "/admin/products/$id" }),
	]),
	history: createMemoryHistory({ initialEntries: ["/admin/products"] }),
});

export function render(
	element: ReactNode,
	load: (queryClient: QueryClient) => void = () => {},
	role: "admin" | "support" = "admin",
) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, store);
	queryClient.setQueryData(productOptionsQuery.queryKey, options);
	load(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<StaffAccessProvider user={{ role }}>
				<RouterContextProvider router={router}>{element}</RouterContextProvider>
			</StaffAccessProvider>
		</QueryClientProvider>,
	);
}
