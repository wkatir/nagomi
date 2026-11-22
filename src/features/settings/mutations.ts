import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { toast } from "sonner";
import { api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";

type SettingsApi = ReturnType<typeof api>["admin"]["settings"];
export type SettingsPatch = InferRequestType<SettingsApi["$patch"]>["json"];

export function useRefreshSettings() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
			queryClient.invalidateQueries({ queryKey: ["store"] }),
		]);
}

// No onError: each form shows the refusal on its field.
export function useSaveSettings() {
	const refresh = useRefreshSettings();
	return useMutation({
		mutationFn: (json: SettingsPatch) =>
			parseResponse(api().admin.settings.$patch({ json })),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});
}
