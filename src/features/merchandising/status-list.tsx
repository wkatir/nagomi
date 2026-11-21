import type { UseQueryResult } from "@tanstack/react-query";
import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import {
	type ListColumns,
	type ListSearch,
	useDataTable,
} from "#/components/admin/data-table/use-data-table";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import type { Paged } from "#/lib/list";

export type StatusListSearch<
	Sort extends string,
	Status extends string,
> = ListSearch<Sort> & {
	q?: string | undefined;
	status?: Status | undefined;
};

export type StatusListChange<
	Sort extends string,
	Status extends string,
> = Partial<StatusListSearch<Sort, Status>>;

export type ListQuery<Row> = Pick<
	UseQueryResult<Paged<Row>>,
	| "data"
	| "isPending"
	| "isError"
	| "error"
	| "isPlaceholderData"
	| "isFetching"
	| "refetch"
>;

export function StatusList<
	Row extends RowData,
	Sort extends string,
	Status extends string,
>({
	query,
	columns,
	sorts,
	search,
	onSearchChange,
	statuses,
	statusLabel,
	allLabel,
	searchLabel,
	getRowId,
	action,
	emptyTitle,
	emptyHint,
}: {
	query: ListQuery<Row>;
	columns: ListColumns<Row>;
	sorts: readonly Sort[];
	search: StatusListSearch<Sort, Status>;
	onSearchChange: (change: StatusListChange<Sort, Status>) => void;
	statuses: readonly Status[];
	statusLabel: Record<Status, () => string>;
	allLabel: string;
	searchLabel: string;
	getRowId: (row: Row) => string;
	action: ReactNode;
	emptyTitle: string;
	emptyHint: string;
}) {
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts,
		onSearchChange,
		getRowId,
	});
	const filter = (change: StatusListChange<Sort, Status>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = Boolean(search.q || search.status);
	const clear = () =>
		onSearchChange({ page: 1, q: undefined, status: undefined });

	return (
		<>
			<StatusTabs
				values={statuses}
				label={statusLabel}
				allLabel={allLabel}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: searchLabel,
				}}
				filtered={filtered}
				onClearFilters={clear}
				actions={action}
			/>
			<DataTable
				table={table}
				query={query}
				filtered={filtered}
				onClearFilters={clear}
				empty={
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{emptyTitle}</EmptyTitle>
							<EmptyDescription>{emptyHint}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>{action}</EmptyContent>
					</Empty>
				}
			/>
		</>
	);
}
