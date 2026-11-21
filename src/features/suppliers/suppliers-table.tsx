import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { supplierStatusLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import {
	SUPPLIER_SORTS,
	type SupplierListSearch,
} from "#/lib/schemas/suppliers";
import { m } from "#/paraglide/messages";
import { supplierColumns } from "./columns";
import { useSupplierStatus } from "./mutations";
import { type SupplierRow, suppliersQuery } from "./queries";
import { clearedFilters, isFiltered } from "./search";
import { SupplierDialog } from "./supplier-dialog";

export function SuppliersTable({
	search,
	onSearchChange,
}: {
	search: SupplierListSearch;
	onSearchChange: (change: Partial<SupplierListSearch>) => void;
}) {
	const query = useQuery({
		...suppliersQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useSupplierStatus();
	// `null` is the dialog for a new supplier; a row, the dialog that edits it.
	const [editing, setEditing] = useState<SupplierRow | null | undefined>();
	const columns = supplierColumns({
		onEdit: setEditing,
		onStatus: (supplier) =>
			status.mutate({
				id: supplier.id,
				status: supplier.status === "active" ? "archived" : "active",
			}),
	});
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: SUPPLIER_SORTS,
		onSearchChange,
		getRowId: (supplier) => String(supplier.id),
	});
	const filter = (change: Partial<SupplierListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={ARCHIVABLE_STATUSES}
				label={supplierStatusLabel}
				allLabel={m.admin_supplier_status_all()}
				value={search.status}
				onChange={(next) => filter({ status: next })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_supplier_search(),
				}}
				filtered={filtered}
				onClearFilters={clear}
				actions={
					<Button size="sm" onClick={() => setEditing(null)}>
						<PlusIcon aria-hidden />
						{m.admin_supplier_new()}
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
							<EmptyTitle>{m.admin_supplier_empty()}</EmptyTitle>
							<EmptyDescription>
								{m.admin_supplier_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={() => setEditing(null)}>
								<PlusIcon aria-hidden />
								{m.admin_supplier_new()}
							</Button>
						</EmptyContent>
					</Empty>
				}
			/>
			{editing !== undefined && (
				<SupplierDialog
					supplier={editing}
					onClose={() => setEditing(undefined)}
				/>
			)}
		</>
	);
}
