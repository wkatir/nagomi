import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, parseResponse } from "#/lib/api";
import type { ArchivableStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

// A supplier shows in lists, pickers and the purchase orders that name it, so the whole back
// office refreshes.
export function useRefreshAfterSupplierChange() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: ["admin"] });
}

export function useSupplierStatus() {
	const refresh = useRefreshAfterSupplierChange();
	return useMutation({
		mutationFn: ({ id, status }: { id: number; status: ArchivableStatus }) =>
			parseResponse(
				api().admin.suppliers[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		onSuccess: async (_, { status }) => {
			await refresh();
			toast.success(
				status === "archived"
					? m.admin_supplier_archived_toast()
					: m.admin_supplier_restored_toast(),
			);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}

export function useSupplierItemStatus(supplierId: number) {
	const refresh = useRefreshAfterSupplierChange();
	return useMutation({
		mutationFn: ({
			itemId,
			status,
		}: {
			itemId: number;
			status: ArchivableStatus;
		}) =>
			parseResponse(
				api().admin.suppliers[":id"].items[":itemId"].$patch({
					param: { id: String(supplierId), itemId: String(itemId) },
					json: { status },
				}),
			),
		onSuccess: async (_, { status }) => {
			await refresh();
			toast.success(
				status === "archived"
					? m.admin_supplier_item_archived_toast()
					: m.admin_supplier_item_restored_toast(),
			);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}
