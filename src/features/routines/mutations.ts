import { api, parseResponse } from "#/lib/api";
import type { ProductStatus } from "#/lib/enums";
import {
	lifecycleMessage,
	useStatusChange,
} from "../merchandising/status-change";
import { routinesKeys } from "./queries";

export const useRoutineStatus = () =>
	useStatusChange<ProductStatus>({
		root: routinesKeys.all,
		change: (id, status) =>
			parseResponse(
				api().admin.routines[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		message: lifecycleMessage,
	});
