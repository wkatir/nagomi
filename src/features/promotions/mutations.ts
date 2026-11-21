import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { promotionStatusLabel } from "#/components/admin/labels";
import { api, parseResponse } from "#/lib/api";
import type { PromotionStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { promotionsKeys } from "./queries";

export function usePromotionStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			promotion,
			status,
		}: {
			promotion: { id: number; code: string };
			status: PromotionStatus;
		}) =>
			parseResponse(
				api().admin.promotions[":id"].$patch({
					param: { id: String(promotion.id) },
					json: { status },
				}),
			),
		onSuccess: (_, { promotion, status }) => {
			toast.success(
				m.admin_promotion_status_set({
					code: promotion.code,
					status: promotionStatusLabel[status](),
				}),
			);
			return queryClient.invalidateQueries({ queryKey: promotionsKeys.all });
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}
