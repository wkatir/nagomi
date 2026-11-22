import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DownloadIcon, XIcon } from "lucide-react";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import {
	movementKindLabel,
	movementReasonLabel,
} from "#/components/admin/labels";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useStoreDate } from "#/hooks/use-store-date";
import { MOVEMENT_KINDS, MOVEMENT_REASONS } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import type { MovementFilters } from "#/lib/schemas/inventory";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import { ProductFilter } from "./product-filter";
import { type Movement, movementsQuery } from "./queries";
import {
	clearedMovementFilters,
	isLedgerFiltered,
	movementsExportHref,
} from "./search";

const SKELETON_ROWS = Array.from({ length: 8 }, (_, n) => `skeleton-${n}`);

const options = <T extends string>(
	values: readonly T[],
	label: Record<T, () => string>,
) => values.map((value) => ({ value, label: label[value]() }));

function MovementRow({ movement }: { movement: Movement }) {
	const formatDate = useStoreDate();
	return (
		<TableRow>
			<TableCell className="whitespace-nowrap">
				{formatDate(movement.createdAt, {
					dateStyle: "medium",
					timeStyle: "short",
				})}
			</TableCell>
			<TableCell>
				<Badge variant={movement.quantity > 0 ? "default" : "outline"}>
					{movementKindLabel[movement.kind]()}
				</Badge>
			</TableCell>
			<TableCell>
				<div className="grid">
					<span>{variantLabel(movement)}</span>
					<span className="type-meta text-muted-foreground">
						{movement.sku}
					</span>
				</div>
			</TableCell>
			<TableCell
				data-gain={movement.quantity > 0}
				className="text-right font-bold tabular-nums data-[gain=false]:text-destructive"
			>
				{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
			</TableCell>
			<TableCell className="max-md:hidden">
				<span>{movement.lotCode ?? `#${movement.lotId}`}</span>
			</TableCell>
			<TableCell className="max-md:hidden">
				<div className="grid">
					{movement.reason && (
						<span>{movementReasonLabel[movement.reason]()}</span>
					)}
					{movement.note && (
						<span className="type-meta text-muted-foreground">
							{movement.note}
						</span>
					)}
				</div>
			</TableCell>
			<TableCell className="max-md:hidden">
				{movement.orderCode && (
					<Link
						to="/admin/orders"
						search={{ q: movement.orderCode }}
						className="underline-offset-4 hover:underline"
					>
						{movement.orderCode}
					</Link>
				)}
			</TableCell>
			<TableCell className="max-lg:hidden">
				{movement.createdByName ?? movement.createdBy}
			</TableCell>
		</TableRow>
	);
}

export function MovementsFeed({
	filters,
	onFiltersChange,
}: {
	filters: MovementFilters;
	onFiltersChange: (change: MovementFilters) => void;
}) {
	const query = useInfiniteQuery(movementsQuery(filters));
	const movements = query.data?.pages.flatMap((page) => page.items) ?? [];
	const filtered = isLedgerFiltered(filters);
	const clear = () => onFiltersChange(clearedMovementFilters);

	return (
		<>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<SelectFilter
					label={m.admin_movement_filter_kind()}
					allLabel={m.admin_movement_filter_kind_all()}
					value={filters.kind}
					options={options(MOVEMENT_KINDS, movementKindLabel)}
					onChange={(kind) => onFiltersChange({ kind })}
				/>
				<SelectFilter
					label={m.admin_movement_filter_reason()}
					allLabel={m.admin_movement_filter_reason_all()}
					value={filters.reason}
					options={options(MOVEMENT_REASONS, movementReasonLabel)}
					onChange={(reason) => onFiltersChange({ reason })}
				/>
				<ProductFilter
					sku={filters.sku}
					onChange={(sku) => onFiltersChange({ sku })}
				/>
				<DateRangeFilter
					value={{ from: filters.from, to: filters.to }}
					onChange={({ from, to }) => onFiltersChange({ from, to })}
				/>
				{filtered && (
					<Button variant="ghost" size="sm" onClick={clear}>
						<XIcon aria-hidden />
						{m.admin_table_clear_filters()}
					</Button>
				)}
				<div className="ml-auto flex items-center gap-2">
					<Button variant="outline" size="sm" asChild>
						<a href={movementsExportHref(filters)} download>
							<DownloadIcon aria-hidden />
							{m.admin_export_csv()}
						</a>
					</Button>
				</div>
			</div>
			<div className="rounded-md border" aria-busy={query.isFetching}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_col_date()}</TableHead>
							<TableHead>{m.admin_movement_col_kind()}</TableHead>
							<TableHead>{m.admin_col_product()}</TableHead>
							<TableHead className="text-right">{m.admin_quantity()}</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_lot_code()}
							</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_adjust_reason()}
							</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_col_order()}
							</TableHead>
							<TableHead className="max-lg:hidden">
								{m.admin_movement_col_by()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{query.isPending
							? SKELETON_ROWS.map((key) => (
									<TableRow key={key}>
										<TableCell colSpan={8}>
											<Skeleton className="h-5 w-full max-w-md" />
										</TableCell>
									</TableRow>
								))
							: movements.map((movement) => (
									<MovementRow key={movement.id} movement={movement} />
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
				{!query.isPending && !query.isError && movements.length === 0 && (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>
								{filtered
									? m.admin_table_no_results()
									: m.admin_movement_empty()}
							</EmptyTitle>
							<EmptyDescription>
								{filtered
									? m.admin_table_no_results_hint()
									: m.admin_movement_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
						{filtered && (
							<EmptyContent>
								<Button variant="outline" onClick={clear}>
									{m.admin_table_clear_filters()}
								</Button>
							</EmptyContent>
						)}
					</Empty>
				)}
			</div>
			{movements.length > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-3 pt-4 type-small text-muted-foreground">
					<p aria-live="polite">
						{m.admin_movement_loaded({ count: movements.length })}
						{!query.hasNextPage && ` · ${m.admin_movement_end()}`}
					</p>
					{query.hasNextPage && (
						<Button
							variant="outline"
							size="sm"
							disabled={query.isFetchingNextPage}
							onClick={() => query.fetchNextPage()}
						>
							{query.isFetchingNextPage && <Spinner aria-hidden />}
							{m.admin_movement_more()}
						</Button>
					)}
				</div>
			)}
		</>
	);
}
