import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { storeQuery } from "#/lib/queries";

const store = {
	name: "Eclalune",
	currency: "USD",
	defaultLocale: "es",
	countryCode: "SV",
	timeZone: "America/El_Salvador",
	whatsappNumber: null,
	whatsappDisplay: null,
	freeShippingFrom: null,
	maxQuantityPerLine: 20,
	returnWindowDays: null,
	checkoutOpen: false,
	paymentMethods: [],
	promises: { es: [], en: [] },
	business: {
		foundingYear: null,
		legalName: null,
		taxIdLabel: null,
		taxId: null,
		address: null,
		phone: null,
		email: null,
	},
};

type Options = {
	defaultLocale?: "es" | "en";
	// Query results already in the cache, as the route loaders leave them: [key, data].
	queries?: readonly (readonly [readonly unknown[], unknown])[];
};

function clientWith({ defaultLocale = "es", queries = [] }: Options) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, { ...store, defaultLocale });
	for (const [key, data] of queries) queryClient.setQueryData(key, data);
	return queryClient;
}

// The markup a back office component renders on the server, with the store's data loaded as
// the admin layout loads it before any screen (money, dates and the default language read it).
export function renderAdmin(ui: ReactNode, options: Options = {}) {
	return renderToStaticMarkup(
		<QueryClientProvider client={clientWith(options)}>
			{ui}
		</QueryClientProvider>,
	);
}

// The same inside a router, for what draws links.
export async function renderAdminPage(ui: ReactNode, options: Options = {}) {
	const router = createRouter({
		routeTree: createRootRoute({ component: () => ui }),
		history: createMemoryHistory({ initialEntries: ["/"] }),
		isServer: true,
	});
	await router.load();
	return renderToStaticMarkup(
		<QueryClientProvider client={clientWith(options)}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}
