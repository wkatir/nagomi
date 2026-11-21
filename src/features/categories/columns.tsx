import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { m } from "#/paraglide/messages";
import {
	type ArchivableActions,
	archivableColumns,
} from "../merchandising/archivable-columns";
import type { CategoryRow } from "./queries";

const column = createColumnHelper<ListFeatures, CategoryRow>();

// Column ids are the sorts the API accepts (CATEGORY_SORTS).
export const categoryColumns = (actions: ArchivableActions) => {
	const shared = archivableColumns<CategoryRow>(actions);
	return column.columns([
		shared.name,
		shared.slug,
		column.accessor("routineStep", {
			header: m.admin_category_col_step(),
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
