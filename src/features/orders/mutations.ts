import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { invalidateCatalog } from "#/lib/queries";

// An order change moves stock and money, so all admin queries and the catalog refresh.
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
		markPaid: useMutation({
			mutationFn: (reference: string | undefined) =>
				parseResponse(
					order()["mark-paid"].$post({
						param,
						json: reference ? { reference } : {},
					}),
				),
			...options,
		}),
		ship: useMutation({
			mutationFn: (input: { courier: string; trackingCode?: string }) =>
				parseResponse(order().ship.$post({ param, json: input })),
			...options,
		}),
		deliver: useMutation({
			mutationFn: () => parseResponse(order().deliver.$post({ param })),
			...options,
		}),
		cancel: useMutation({
			mutationFn: (reason: string) =>
				parseResponse(order().cancel.$post({ param, json: { reason } })),
			...options,
		}),
	};
}

export function useExpirePending() {
	const refresh = useRefreshAfterOrderChange();
	return useMutation({
		mutationFn: () =>
			parseResponse(api().admin.orders["expire-pending"].$post()),
		onSuccess: refresh,
		onError: (error: unknown) => toast.error(errorMessage(error)),
	});
}
