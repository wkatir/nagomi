import {
	type CellData,
	type ColumnDef,
	type PaginationState,
	type RowData,
	rowPaginationFeature,
	rowSortingFeature,
	type SortingState,
	type TableFeatures,
	tableFeatures,
	type Updater,
	useTable,
} from "@tanstack/react-table";
import { PAGE_SIZES, type PageSize, type SortDir } from "#/lib/list";

declare module "@tanstack/react-table" {
	interface ColumnMeta<
		in out TFeatures extends TableFeatures,
		in out TData extends RowData,
		TValue extends CellData = CellData,
	> {
		align?: "right";
		hideOnMobile?: boolean;
	}
}

const listFeatures = tableFeatures({
	rowPaginationFeature,
	rowSortingFeature,
});
export type ListFeatures = typeof listFeatures;
export type ListColumns<TData extends RowData> = ColumnDef<
	ListFeatures,
	TData
>[];

export type ListSearch<Sort extends string = string> = {
	page: number;
	pageSize: PageSize;
	sort: Sort;
	dir: SortDir;
};

const resolve = <T>(updater: Updater<T>, previous: T): T =>
	typeof updater === "function"
		? (updater as (old: T) => T)(previous)
		: updater;

export function useDataTable<TData extends RowData, Sort extends string>({
	data,
	columns,
	rowCount,
	search,
	sorts,
	onSearchChange,
	getRowId,
}: {
	data: TData[];
	columns: ListColumns<TData>;
	rowCount: number;
	search: ListSearch<Sort>;
	sorts: readonly Sort[];
	onSearchChange: (change: Partial<ListSearch<Sort>>) => void;
	getRowId: (row: TData) => string;
}) {
	const pagination: PaginationState = {
		pageIndex: search.page - 1,
		pageSize: search.pageSize,
	};
	const sorting: SortingState = [
		{ id: search.sort, desc: search.dir === "desc" },
	];
	return useTable({
		features: listFeatures,
		columns,
		data,
		rowCount,
		getRowId,
		manualPagination: true,
		manualSorting: true,
		enableSortingRemoval: false,
		state: { pagination, sorting },
		onPaginationChange: (updater) => {
			const next = resolve(updater, pagination);
			if (next.pageSize === pagination.pageSize)
				return onSearchChange({ page: next.pageIndex + 1 });
			const pageSize = PAGE_SIZES.find((size) => size === next.pageSize);
			if (!pageSize) throw new Error(`Unsupported page size ${next.pageSize}`);
			onSearchChange({ page: 1, pageSize });
		},
		onSortingChange: (updater) => {
			const [next] = resolve(updater, sorting);
			if (!next) throw new Error("A list is always sorted by one column");
			const sort = sorts.find((s) => s === next.id);
			if (!sort) throw new Error(`Unsupported sort ${next.id}`);
			onSearchChange({ page: 1, sort, dir: next.desc ? "desc" : "asc" });
		},
	});
}
