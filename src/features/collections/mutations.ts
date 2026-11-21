import { api, parseResponse } from "#/lib/api";
import type { ProductStatus } from "#/lib/enums";
import {
	lifecycleMessage,
	useStatusChange,
} from "../merchandising/status-change";
import { collectionsKeys } from "./queries";

export const useCollectionStatus = () =>
	useStatusChange<ProductStatus>({
		root: collectionsKeys.all,
		change: (id, status) =>
			parseResponse(
				api().admin.collections[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		message: lifecycleMessage,
	});
