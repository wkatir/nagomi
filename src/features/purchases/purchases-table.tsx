import {
	keepPreviousData,
	useQuery,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { purchaseStatusLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { supplierOptionsQuery } from "#/features/suppliers/queries";
import { PURCHASE_ORDER_STATUSES } from "#/lib/enums";
import {
	PURCHASE_SORTS,
	type PurchaseListSearch,
} from "#/lib/schemas/purchasing";
import { m } from "#/paraglide/messages";
import { usePurchaseColumns } from "./columns";
import { purchasesQuery } from "./queries";
import { clearedFilters, isFiltered } from "./search";

export function PurchasesTable({
	search,
	onSearchChange,
}: {
	search: PurchaseListSearch;
	onSearchChange: (change: Partial<PurchaseListSearch>) => void;
}) {
	const query = useQuery({
		...purchasesQuery(search),
		placeholderData: keepPreviousData,
	});
	// Archived suppliers keep their purchase orders: they can be filtered by too.
	const { data: suppliers } = useSuspenseQuery(supplierOptionsQuery());
	const columns = usePurchaseColumns();
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: PURCHASE_SORTS,
		onSearchChange,
		getRowId: (purchase) => String(purchase.id),
	});
	const filter = (change: Partial<PurchaseListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={PURCHASE_ORDER_STATUSES}
				label={purchaseStatusLabel}
				allLabel={m.admin_purchase_all()}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_purchase_search(),
				}}
				filtered={filtered}
				onClearFilters={clear}
				filters={
					<>
						<SelectFilter
							label={m.admin_purchase_filter_supplier()}
							allLabel={m.admin_purchase_filter_supplier_all()}
							value={
								search.supplierId === undefined
									? undefined
									: String(search.supplierId)
							}
							options={suppliers.map((supplier) => ({
								value: String(supplier.id),
								label: supplier.name,
							}))}
							onChange={(supplierId) =>
								filter({
									supplierId:
										supplierId === undefined ? undefined : Number(supplierId),
								})
							}
						/>
						<DateRangeFilter
							value={{ from: search.from, to: search.to }}
							onChange={({ from, to }) => filter({ from, to })}
						/>
					</>
				}
				actions={
					<Button size="sm" asChild>
						<Link to="/admin/purchases/new">
							<PlusIcon aria-hidden />
							{m.admin_purchase_new()}
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
							<EmptyTitle>{m.admin_purchase_empty()}</EmptyTitle>
							<EmptyDescription>
								{m.admin_purchase_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button asChild>
								<Link to="/admin/purchases/new">
									<PlusIcon aria-hidden />
									{m.admin_purchase_new()}
								</Link>
							</Button>
						</EmptyContent>
					</Empty>
				}
			/>
		</>
	);
}
