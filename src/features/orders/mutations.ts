import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { invalidateCatalog } from "#/lib/queries";

// An order change moves stock and money, so every admin query and the store's catalog refresh.
export function useRefreshAfterOrderChange() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["admin"] }),
			invalidateCatalog(queryClient),
		]);
}

export function useOrderActions(id: number) {
	const refresh = useRefreshAfterOrderChange();
	const order = () => api().admin.orders[":id"];
	const param = { id: String(id) };
	const options = {
		onSuccess: refresh,
		onError: (error: unknown) => toast.error(errorMessage(error)),
	};
	return {
		fulfill: useMutation({
			mutationFn: () => parseResponse(order().fulfill.$post({ param })),
			...options,
		}),
		deliver: useMutation({
			mutationFn: () => parseResponse(order().deliver.$post({ param })),
			...options,
		}),
		markPaid: useMutation({
			mutationFn: () => parseResponse(order()["mark-paid"].$post({ param })),
			...options,
		}),
		cancel: useMutation({
			mutationFn: (reason: string | undefined) =>
				parseResponse(order().cancel.$post({ param, json: { reason } })),
			...options,
		}),
	};
}
