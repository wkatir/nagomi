import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { m } from "#/paraglide/messages";
import {
	type ArchivableActions,
	archivableColumns,
} from "../merchandising/archivable-columns";
import type { BrandRow } from "./queries";

const column = createColumnHelper<ListFeatures, BrandRow>();

// Column ids are the sorts the API accepts (BRAND_SORTS).
export const brandColumns = (actions: ArchivableActions) => {
	const shared = archivableColumns<BrandRow>(actions);
	return column.columns([
		shared.name,
		shared.slug,
		column.accessor((brand) => brand.countryCode ?? "", {
			id: "country",
			header: m.admin_brand_col_country(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => getValue(),
		}),
		shared.products,
		shared.status,
		shared.actions,
	]);
};
