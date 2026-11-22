import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { zoneStatusLabel } from "#/components/admin/labels";
import { api, parseResponse } from "#/lib/api";
import type { ArchivableStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { shippingKeys } from "./queries";

// The storefront advertises the zones' free shipping.
export function useRefreshZones() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: shippingKeys.all }),
			queryClient.invalidateQueries({ queryKey: ["store"] }),
		]);
}

export function useZoneStatus() {
	const refresh = useRefreshZones();
	return useMutation({
		mutationFn: ({
			zone,
			status,
		}: {
			zone: { id: number; name: string };
			status: ArchivableStatus;
		}) =>
			parseResponse(
				api().admin["shipping-zones"][":id"].$patch({
					param: { id: String(zone.id) },
					json: { status },
				}),
			),
		onSuccess: async (_, { zone, status }) => {
			await refresh();
			toast.success(
				m.admin_zone_status_set({
					name: zone.name,
					status: zoneStatusLabel[status](),
				}),
			);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}
