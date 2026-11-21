import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { invalidateCatalog } from "#/lib/queries";
import { m } from "#/paraglide/messages";

// A purchase change can add stock and a cost, so every admin query and the store's catalog
// refresh.
export function useRefreshAfterPurchaseChange() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["admin"] }),
			invalidateCatalog(queryClient),
		]);
}

export function useCancelPurchase(id: number) {
	const refresh = useRefreshAfterPurchaseChange();
	return useMutation({
		mutationFn: () =>
			parseResponse(
				api().admin["purchase-orders"][":id"].cancel.$post({
					param: { id: String(id) },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_purchase_cancelled_toast());
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}
