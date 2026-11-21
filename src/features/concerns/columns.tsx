import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { m } from "#/paraglide/messages";
import {
	type ArchivableActions,
	archivableColumns,
} from "../merchandising/archivable-columns";
import type { ConcernRow } from "./queries";

const column = createColumnHelper<ListFeatures, ConcernRow>();

// Column ids are the sorts the API accepts (CONCERN_SORTS).
export const concernColumns = (actions: ArchivableActions) => {
	const shared = archivableColumns<ConcernRow>(actions);
	return column.columns([
		shared.name,
		shared.slug,
		column.accessor("position", {
			header: m.admin_concern_col_position(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		shared.products,
		shared.status,
		shared.actions,
	]);
};
