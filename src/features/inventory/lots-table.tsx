import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { LOT_SORTS, type LotListSearch } from "#/lib/schemas/inventory";
import { m } from "#/paraglide/messages";
import { AdjustLotDialog } from "./adjust-lot-dialog";
import { useLotColumns } from "./lot-columns";
import { type LotRow, lotsQuery } from "./queries";
import { clearedLotFilters, isLotsFiltered } from "./search";

export function LotsTable({
	search,
	onSearchChange,
}: {
	search: LotListSearch;
	onSearchChange: (change: Partial<LotListSearch>) => void;
}) {
	const query = useQuery({
		...lotsQuery(search),
		placeholderData: keepPreviousData,
	});
	const [adjusting, setAdjusting] = useState<LotRow | null>(null);
	const columns = useLotColumns({ onAdjust: setAdjusting });
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: LOT_SORTS,
		onSearchChange,
		getRowId: (lot) => String(lot.lotId),
	});
	const filter = (change: Partial<LotListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isLotsFiltered(search);
	const clear = () => onSearchChange(clearedLotFilters);

	return (
		<>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_lot_search(),
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
							<EmptyTitle>{m.admin_lot_empty()}</EmptyTitle>
							<EmptyDescription>{m.admin_lot_empty_hint()}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				}
			/>
			{adjusting && (
				<AdjustLotDialog lot={adjusting} onClose={() => setAdjusting(null)} />
			)}
		</>
	);
}
