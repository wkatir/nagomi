import { api, parseResponse } from "#/lib/api";
import type { ArchivableStatus } from "#/lib/enums";
import {
	archiveMessage,
	useStatusChange,
} from "../merchandising/status-change";
import { categoriesKeys } from "./queries";

export const useCategoryStatus = () =>
	useStatusChange<ArchivableStatus>({
		root: categoriesKeys.all,
		change: (id, status) =>
			parseResponse(
				api().admin.categories[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		message: archiveMessage,
	});
