import { useQueryClient } from "@tanstack/react-query";
import { invalidateCatalog } from "#/lib/queries";

// A stock change also moves the reports and what the store sells.
export function useRefreshAfterStockChange() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["admin"] }),
			invalidateCatalog(queryClient),
		]);
}
