import { api, parseResponse } from "#/lib/api";
import type { ArchivableStatus } from "#/lib/enums";
import {
	archiveMessage,
	useStatusChange,
} from "../merchandising/status-change";
import { concernsKeys } from "./queries";

export const useConcernStatus = () =>
	useStatusChange<ArchivableStatus>({
		root: concernsKeys.all,
		change: (id, status) =>
			parseResponse(
				api().admin.concerns[":id"].$patch({
					param: { id: String(id) },
					json: { status },
				}),
			),
		message: archiveMessage,
	});
