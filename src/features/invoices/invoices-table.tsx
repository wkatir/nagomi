import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataTable } from "#/components/admin/data-table/data-table";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { invoiceStatusLabel } from "#/components/admin/labels";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { TAX_DOCUMENT_STATUSES } from "#/lib/enums";
import { INVOICE_SORTS, type InvoiceListSearch } from "#/lib/schemas/invoices";
import { m } from "#/paraglide/messages";
import { useInvoiceColumns } from "./columns";
import { invoicesQuery } from "./queries";
import { clearedFilters, isFiltered } from "./search";

export function InvoicesTable({
	search,
	onSearchChange,
}: {
	search: InvoiceListSearch;
	onSearchChange: (change: Partial<InvoiceListSearch>) => void;
}) {
	const query = useQuery({
		...invoicesQuery(search),
		placeholderData: keepPreviousData,
	});
	const columns = useInvoiceColumns();
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: INVOICE_SORTS,
		onSearchChange,
		getRowId: (doc) => String(doc.id),
	});
	const filter = (change: Partial<InvoiceListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={TAX_DOCUMENT_STATUSES}
				label={invoiceStatusLabel}
				allLabel={m.admin_invoices_all()}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_invoices_search(),
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
							<EmptyTitle>{m.admin_invoices_empty()}</EmptyTitle>
							<EmptyDescription>
								{m.admin_invoices_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				}
			/>
		</>
	);
}
