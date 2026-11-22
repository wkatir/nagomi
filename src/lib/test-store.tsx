import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { storeQuery } from "#/lib/queries";
import { testStore } from "#/test/store-fixture";

export function renderWithStore(
	children: ReactNode,
	seed: (queryClient: QueryClient) => void = () => {},
) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(storeQuery.queryKey, testStore);
	seed(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
	);
}
