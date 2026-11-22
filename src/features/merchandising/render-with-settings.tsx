import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffAccessProvider } from "#/components/admin/staff-access";
import type { Locale } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";

// For tests. The store holds only what the forms read: the language, currency and region.
export function renderWithSettings(
	node: ReactNode,
	defaultLocale: Locale = "es",
	prepare?: (client: QueryClient) => void,
) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, {
		currency: "USD",
		countryCode: "SV",
		timeZone: "America/El_Salvador",
		defaultLocale,
	} as unknown as never);
	prepare?.(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<StaffAccessProvider user={{ role: "admin" }}>{node}</StaffAccessProvider>
		</QueryClientProvider>,
	);
}
