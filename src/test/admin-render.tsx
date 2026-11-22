import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffAccessProvider } from "#/components/admin/staff-access";
import { storeQuery } from "#/lib/queries";
import { testStore } from "./store-fixture";

type Options = {
	defaultLocale?: "es" | "en";
	role?: "admin" | "support";
	// Query results already in the cache, as the route loaders leave them: [key, data].
	queries?: readonly (readonly [readonly unknown[], unknown])[];
};

function clientWith({ defaultLocale = "es", queries = [] }: Options) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, {
		...testStore,
		defaultLocale,
	});
	for (const [key, data] of queries) queryClient.setQueryData(key, data);
	return queryClient;
}

export function renderAdmin(ui: ReactNode, options: Options = {}) {
	return renderToStaticMarkup(
		<QueryClientProvider client={clientWith(options)}>
			<StaffAccessProvider user={{ role: options.role ?? "admin" }}>
				{ui}
			</StaffAccessProvider>
		</QueryClientProvider>,
	);
}

export async function renderAdminPage(ui: ReactNode, options: Options = {}) {
	const router = createRouter({
		routeTree: createRootRoute({ component: () => ui }),
		history: createMemoryHistory({ initialEntries: ["/"] }),
		isServer: true,
	});
	await router.load();
	return renderToStaticMarkup(
		<QueryClientProvider client={clientWith(options)}>
			<StaffAccessProvider user={{ role: options.role ?? "admin" }}>
				<RouterProvider router={router} />
			</StaffAccessProvider>
		</QueryClientProvider>,
	);
}
