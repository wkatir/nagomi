import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { TablePagination } from "./table-pagination";
import type { ListFeatures } from "./use-data-table";

const SKELETON_ROWS = Array.from({ length: 8 }, (_, n) => `skeleton-${n}`);

const columnClass = (
	meta: { align?: "right"; hideOnMobile?: boolean } | undefined,
) =>
	cn(
		meta?.align === "right" && "text-right",
		meta?.hideOnMobile && "max-md:hidden",
	);

const ariaSort = (sorted: false | "asc" | "desc") =>
	sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";

export function DataTable<TData extends RowData>({
	table,
	query,
	filtered,
	onClearFilters,
	empty,
}: {
	table: ReactTable<ListFeatures, TData>;
	query: Pick<
		UseQueryResult<unknown>,
		| "isPending"
		| "isError"
		| "error"
		| "isPlaceholderData"
		| "isFetching"
		| "refetch"
	>;
	filtered: boolean;
	onClearFilters: () => void;
	empty: ReactNode;
}) {
	const rows = table.getRowModel().rows;

	return (
		<div>
			<div className="rounded-md border" aria-busy={query.isFetching}>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((group) => (
							<TableRow key={group.id}>
								{group.headers.map((header) => {
									const column = header.column;
									const label = <table.FlexRender header={header} />;
									return (
										<TableHead
											key={header.id}
											className={columnClass(column.columnDef.meta)}
											aria-sort={
												column.getCanSort()
													? ariaSort(column.getIsSorted())
													: undefined
											}
										>
											{column.getCanSort() ? (
												<Button
													variant="ghost"
													size="sm"
													className="-mx-3 h-8 data-[sorted=true]:text-foreground"
													data-sorted={column.getIsSorted() !== false}
													onClick={column.getToggleSortingHandler()}
												>
													{label}
													{column.getIsSorted() === "asc" ? (
														<ArrowUpIcon aria-hidden />
													) : column.getIsSorted() === "desc" ? (
														<ArrowDownIcon aria-hidden />
													) : (
														<ArrowUpDownIcon
															aria-hidden
															className="opacity-50"
														/>
													)}
												</Button>
											) : (
												label
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody
						className={cn(
							"transition-opacity",
							query.isPlaceholderData && "opacity-60",
						)}
					>
						{query.isPending
							? SKELETON_ROWS.map((key) => (
									<TableRow key={key}>
										{table.getAllLeafColumns().map((column) => (
											<TableCell
												key={column.id}
												className={columnClass(column.columnDef.meta)}
											>
												<Skeleton className="h-5 w-full max-w-32" />
											</TableCell>
										))}
									</TableRow>
								))
							: rows.map((row) => (
									<TableRow key={row.id}>
										{row.getAllCells().map((cell) => (
											<TableCell
												key={cell.id}
												className={columnClass(cell.column.columnDef.meta)}
											>
												<table.FlexRender cell={cell} />
											</TableCell>
										))}
									</TableRow>
								))}
					</TableBody>
				</Table>
				{query.isError && (
					<Alert variant="destructive" className="m-4 w-auto">
						<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
							{errorMessage(query.error)}
							<Button
								variant="outline"
								size="sm"
								onClick={() => query.refetch()}
							>
								{m.admin_table_retry()}
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{!query.isPending && !query.isError && rows.length === 0 && (
					<div>
						{filtered ? (
							<Empty>
								<EmptyHeader>
									<EmptyTitle>{m.admin_table_no_results()}</EmptyTitle>
									<EmptyDescription>
										{m.admin_table_no_results_hint()}
									</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button variant="outline" onClick={onClearFilters}>
										{m.admin_table_clear_filters()}
									</Button>
								</EmptyContent>
							</Empty>
						) : (
							empty
						)}
					</div>
				)}
			</div>
			<TablePagination table={table} />
		</div>
	);
}
