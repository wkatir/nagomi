import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import type { ProductStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { invalidateCatalog } from "#/lib/queries";
import { m } from "#/paraglide/messages";

// Other screens and the open product's breadcrumb name products, so everything reloads.
export function useRefreshAfterProductChange() {
	const queryClient = useQueryClient();
	const router = useRouter();
	return async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["admin"] }),
			invalidateCatalog(queryClient),
		]);
		await router.invalidate();
	};
}

export function useVariantStatus() {
	const refresh = useRefreshAfterProductChange();
	return useMutation({
		mutationFn: ({
			id,
			status,
			archiveWithStock,
		}: {
			id: number;
			status: "active" | "archived";
			archiveWithStock?: true;
		}) =>
			parseResponse(
				api().admin.products.variants[":id"].$patch({
					param: { id: String(id) },
					json: { status, archiveWithStock },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
		// For a size, `in_use` means an open purchase order, not published products.
		onError: (error) =>
			toast.error(
				apiErrorOf(error)?.code === "in_use"
					? m.admin_product_size_in_use()
					: errorMessage(error),
			),
	});
}

export function useProductStatus() {
	const refresh = useRefreshAfterProductChange();
	return useMutation({
		mutationFn: ({ id, status }: { id: number; status: ProductStatus }) =>
			parseResponse(
				api().admin.products[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}
