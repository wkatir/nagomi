import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { m } from "#/paraglide/messages";
import {
	type ArchivableActions,
	archivableColumns,
} from "../merchandising/archivable-columns";
import { categoryIcon, categoryIconLabel } from "./icons";
import type { CategoryRow } from "./queries";

const column = createColumnHelper<ListFeatures, CategoryRow>();

// Column ids are the sorts the API accepts (CATEGORY_SORTS).
export const categoryColumns = (actions: ArchivableActions) => {
	const shared = archivableColumns<CategoryRow>(actions);
	return column.columns([
		shared.name,
		shared.slug,
		column.accessor("icon", {
			header: m.admin_category_icon(),
			enableSorting: false,
			cell: ({ getValue }) => {
				const Icon = categoryIcon[getValue()];
				return (
					<Icon
						aria-label={categoryIconLabel[getValue()]()}
						className="size-4"
					/>
				);
			},
		}),
		column.accessor("sortOrder", {
			header: m.admin_category_sort_order(),
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
