import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DataTable } from "#/components/admin/data-table/data-table";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { stockViewLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	STOCK_SORTS,
	STOCK_VIEWS,
	type StockListSearch,
} from "#/lib/schemas/inventory";
import { m } from "#/paraglide/messages";
import { stockQuery } from "./queries";
import { clearedStockFilters, isStockFiltered } from "./search";
import { useStockColumns } from "./stock-columns";
import { StockSummary } from "./stock-summary";

export function StockTable({
	search,
	onSearchChange,
}: {
	search: StockListSearch;
	onSearchChange: (change: Partial<StockListSearch>) => void;
}) {
	const query = useQuery({
		...stockQuery(search),
		placeholderData: keepPreviousData,
	});
	const columns = useStockColumns();
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: STOCK_SORTS,
		onSearchChange,
		getRowId: (row) => String(row.variantId),
	});
	const filter = (change: Partial<StockListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isStockFiltered(search);
	const clear = () => onSearchChange(clearedStockFilters);

	return (
		<>
			<StockSummary />
			<StatusTabs
				values={STOCK_VIEWS}
				label={stockViewLabel}
				allLabel={m.admin_inventory_view_all()}
				value={search.view}
				onChange={(view) => filter({ view })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_inventory_search(),
				}}
				filtered={filtered}
				onClearFilters={clear}
			/>
			<DataTable
				table={table}
				query={query}
				filtered={filtered}
				onClearFilters={clear}
				empty={
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{m.admin_inventory_empty()}</EmptyTitle>
							<EmptyDescription>{m.admin_lot_empty_hint()}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button asChild>
								<Link to="/admin/purchases/new">{m.admin_purchase_new()}</Link>
							</Button>
						</EmptyContent>
					</Empty>
				}
			/>
		</>
	);
}
