import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { productStatusLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { PRODUCT_STATUSES } from "#/lib/enums";
import { PRODUCT_SORTS, type ProductListSearch } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { useProductColumns } from "./columns";
import { type ProductOption, useProductOptions } from "./options";
import { productsQuery } from "./queries";
import { clearedFilters, idOf, isFiltered } from "./search";

const choices = (options: ProductOption[] | undefined) =>
	(options ?? []).map(({ value, label }) => ({ value, label }));

export function ProductsTable({
	search,
	onSearchChange,
}: {
	search: ProductListSearch;
	onSearchChange: (change: Partial<ProductListSearch>) => void;
}) {
	const query = useQuery({
		...productsQuery(search),
		placeholderData: keepPreviousData,
	});
	const options = useProductOptions();
	const columns = useProductColumns();
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: PRODUCT_SORTS,
		onSearchChange,
		getRowId: (product) => String(product.id),
	});
	const filter = (change: Partial<ProductListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={PRODUCT_STATUSES}
				label={productStatusLabel}
				allLabel={m.admin_product_all()}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_product_search(),
				}}
				filtered={filtered}
				onClearFilters={clear}
				filters={
					<>
						<SelectFilter
							label={m.admin_product_col_brand()}
							allLabel={m.admin_product_filter_brand_all()}
							value={search.brandId?.toString()}
							options={choices(options.data?.brands)}
							onChange={(value) => filter({ brandId: idOf(value) })}
						/>
						<SelectFilter
							label={m.admin_product_col_category()}
							allLabel={m.admin_product_filter_category_all()}
							value={search.categoryId?.toString()}
							options={choices(options.data?.categories)}
							onChange={(value) => filter({ categoryId: idOf(value) })}
						/>
						<SelectFilter
							label={m.admin_product_filter_need()}
							allLabel={m.admin_product_filter_need_all()}
							value={search.concernId?.toString()}
							options={choices(options.data?.concerns)}
							onChange={(value) => filter({ concernId: idOf(value) })}
						/>
					</>
				}
				actions={
					<Button size="sm" asChild>
						<Link to="/admin/products/new">
							<PlusIcon aria-hidden />
							{m.admin_product_new()}
						</Link>
					</Button>
				}
			/>
			<DataTable
				table={table}
				query={query}
				filtered={filtered}
				onClearFilters={clear}
				empty={
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{m.admin_product_empty()}</EmptyTitle>
							<EmptyDescription>
								{m.admin_product_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button asChild>
								<Link to="/admin/products/new">
									<PlusIcon aria-hidden />
									{m.admin_product_new()}
								</Link>
							</Button>
						</EmptyContent>
					</Empty>
				}
			/>
		</>
	);
}
