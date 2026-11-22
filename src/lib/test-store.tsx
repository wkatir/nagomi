import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { storeQuery } from "#/lib/queries";

export function renderWithStore(
	children: ReactNode,
	seed: (queryClient: QueryClient) => void = () => {},
) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, {
		name: "Nagomi",
		currency: "USD",
		defaultLocale: "es",
		countryCode: "SV",
		timeZone: "America/El_Salvador",
		whatsappNumber: null,
		whatsappDisplay: null,
		freeShippingFrom: null,
		lowStockThreshold: 5,
		maxQuantityPerLine: 20,
		returnWindowDays: null,
		checkoutOpen: false,
		paymentMethods: [],
		paymentOptions: [],
		promises: { es: [], en: [] },
		footerPages: [],
		social: { discord: null, instagram: null, tiktok: null, youtube: null },
		business: {
			foundingYear: null,
			legalName: null,
			taxIdLabel: null,
			taxId: null,
			address: null,
			phone: null,
			email: null,
		},
	});
	seed(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
	);
}
