import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BRAND_SORTS, type BrandListSearch } from "#/lib/schemas/brands";
import { m } from "#/paraglide/messages";
import {
	type ArchivableChange,
	ArchivableTable,
} from "../merchandising/archivable-table";
import { BrandDialog } from "./brand-dialog";
import { brandColumns } from "./columns";
import { useBrandStatus } from "./mutations";
import { brandsQuery } from "./queries";

export function BrandsTable({
	search,
	onSearchChange,
}: {
	search: BrandListSearch;
	onSearchChange: (change: ArchivableChange<BrandListSearch["sort"]>) => void;
}) {
	const query = useQuery({
		...brandsQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useBrandStatus();
	return (
		<ArchivableTable
			query={query}
			search={search}
			onSearchChange={onSearchChange}
			sorts={BRAND_SORTS}
			columns={brandColumns}
			onStatus={(id, next) => status.mutate({ id, status: next })}
			Dialog={BrandDialog}
			newLabel={m.admin_brand_new()}
			searchLabel={m.admin_brand_search()}
			emptyTitle={m.admin_brand_empty()}
			emptyHint={m.admin_brand_empty_hint()}
		/>
	);
}
