import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminSettings } from "#/lib/api";
import type { Locale } from "#/lib/enums";
import { adminSettingsQuery } from "#/lib/queries";

// For tests. The settings hold only the principal language, which is all the forms read.
export function renderWithSettings(
	node: ReactNode,
	defaultLocale: Locale = "es",
	prepare?: (client: QueryClient) => void,
) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(adminSettingsQuery.queryKey, {
		defaultLocale,
	} as unknown as AdminSettings);
	prepare?.(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
	);
}
