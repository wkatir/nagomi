import { api, parseResponse } from "#/lib/api";
import type { ProductStatus } from "#/lib/enums";
import {
	lifecycleMessage,
	useStatusChange,
} from "../merchandising/status-change";
import { bundlesKeys } from "./queries";

export const useBundleStatus = () =>
	useStatusChange<ProductStatus>({
		root: bundlesKeys.all,
		change: (id, status) =>
			parseResponse(
				api().admin.bundles[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		message: lifecycleMessage,
	});
