import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	CATEGORY_SORTS,
	type CategoryListSearch,
} from "#/lib/schemas/categories";
import { m } from "#/paraglide/messages";
import {
	type ArchivableChange,
	ArchivableTable,
} from "../merchandising/archivable-table";
import { CategoryDialog } from "./category-dialog";
import { categoryColumns } from "./columns";
import { useCategoryStatus } from "./mutations";
import { categoriesQuery } from "./queries";

export function CategoriesTable({
	search,
	onSearchChange,
}: {
	search: CategoryListSearch;
	onSearchChange: (
		change: ArchivableChange<CategoryListSearch["sort"]>,
	) => void;
}) {
	const query = useQuery({
		...categoriesQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useCategoryStatus();
	return (
		<ArchivableTable
			query={query}
			search={search}
			onSearchChange={onSearchChange}
			sorts={CATEGORY_SORTS}
			columns={categoryColumns}
			onStatus={(id, next) => status.mutate({ id, status: next })}
			Dialog={CategoryDialog}
			newLabel={m.admin_category_new()}
			searchLabel={m.admin_category_search()}
			emptyTitle={m.admin_category_empty()}
			emptyHint={m.admin_category_empty_hint()}
		/>
	);
}
