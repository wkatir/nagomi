import type { ReactTable, RowData } from "@tanstack/react-table";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsLeftIcon,
	ChevronsRightIcon,
} from "lucide-react";
import { useId } from "react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { PAGE_SIZES } from "#/lib/list";
import { m } from "#/paraglide/messages";
import type { ListFeatures } from "./use-data-table";

export function TablePagination<TData extends RowData>({
	table,
}: {
	table: ReactTable<ListFeatures, TData>;
}) {
	const sizeId = useId();
	const { pageIndex, pageSize } = table.state.pagination;
	const total = table.getRowCount();
	const from = total === 0 ? 0 : pageIndex * pageSize + 1;
	const to = Math.min(total, (pageIndex + 1) * pageSize);
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4 type-small text-muted-foreground">
			<p aria-live="polite">
				{total === 0
					? m.admin_table_no_results()
					: m.admin_table_range({ from, to, total })}
			</p>
			<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
				<div className="flex items-center gap-2">
					<Label htmlFor={sizeId} className="font-normal">
						{m.admin_table_rows_per_page()}
					</Label>
					<NativeSelect
						id={sizeId}
						size="sm"
						value={pageSize}
						onChange={(event) => table.setPageSize(Number(event.target.value))}
					>
						{PAGE_SIZES.map((size) => (
							<NativeSelectOption key={size} value={size}>
								{size}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</div>
				<p>
					{m.admin_table_page({
						page: pageIndex + 1,
						pageCount: Math.max(1, table.getPageCount()),
					})}
				</p>
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label={m.admin_table_first_page()}
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.firstPage()}
					>
						<ChevronsLeftIcon aria-hidden />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label={m.admin_table_previous_page()}
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.previousPage()}
					>
						<ChevronLeftIcon aria-hidden />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label={m.admin_table_next_page()}
						disabled={!table.getCanNextPage()}
						onClick={() => table.nextPage()}
					>
						<ChevronRightIcon aria-hidden />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label={m.admin_table_last_page()}
						disabled={!table.getCanNextPage()}
						onClick={() => table.lastPage()}
					>
						<ChevronsRightIcon aria-hidden />
					</Button>
				</div>
			</div>
		</div>
	);
}
