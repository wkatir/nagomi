import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, parseResponse } from "#/lib/api";
import type { ProductStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { slidesKeys } from "./queries";

export function useRefreshSlides() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: slidesKeys.all });
}

export function useSlideStatus() {
	const refresh = useRefreshSlides();
	return useMutation({
		mutationFn: ({ id, status }: { id: number; status: ProductStatus }) =>
			parseResponse(
				api().admin["home-slides"][":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		onSettled: refresh,
		onError: (error) => toast.error(errorMessage(error)),
	});
}

// `slideIds` must be every slide not archived, first to last: the API refuses any other set.
export function useReorderSlides() {
	const refresh = useRefreshSlides();
	return useMutation({
		mutationFn: (slideIds: number[]) =>
			parseResponse(
				api().admin["home-slides"].order.$put({ json: { slideIds } }),
			),
		onSettled: refresh,
		onError: (error) => toast.error(errorMessage(error)),
	});
}
