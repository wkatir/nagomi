import { api, parseResponse } from "#/lib/api";
import type { ArchivableStatus } from "#/lib/enums";
import {
	archiveMessage,
	useStatusChange,
} from "../merchandising/status-change";
import { brandsKeys } from "./queries";

// Archiving a brand with a published product is refused (`in_use`).
export const useBrandStatus = () =>
	useStatusChange<ArchivableStatus>({
		root: brandsKeys.all,
		change: (id, status) =>
			parseResponse(
				api().admin.brands[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		message: archiveMessage,
	});
