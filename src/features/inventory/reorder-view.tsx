import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Section } from "#/components/admin/section";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Label } from "#/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import type { ReorderSearch } from "#/lib/schemas/inventory";
import { m } from "#/paraglide/messages";
import { useRefreshAfterStockChange } from "./mutations";
import { reorderQuery, type Suggestion } from "./queries";
import { groupSuggestions } from "./reorder-groups";
import { reorderReasonLabel } from "./reorder-reasons";

// The API's limit of lines per purchase order.
const MAX_DRAFT_LINES = 100;
const LOOKBACK_WEEKS = [4, 8, 12, 26, 52];
const COVER_WEEKS = [1, 2, 4, 8, 12];

const weekOptions = (presets: number[], current: number) =>
	[...new Set([...presets, current])].sort((a, b) => a - b);

function WeeksSelect({
	label,
	presets,
	value,
	onChange,
}: {
	label: string;
	presets: number[];
	value: number;
	onChange: (weeks: number) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2">
			<Label htmlFor={id} className="font-normal">
				{label}
			</Label>
			<NativeSelect
				id={id}
				size="sm"
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			>
				{weekOptions(presets, value).map((weeks) => (
					<NativeSelectOption key={weeks} value={weeks}>
						{m.admin_inventory_weeks({ count: weeks })}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</div>
	);
}

// A size whose cost is unknown adds nothing to the estimate.
function estimatedCost(rows: Suggestion[]) {
	return rows.reduce(
		(sum, row) => sum + row.orderQuantity * (row.unitCost ?? 0),
		0,
	);
}

function SuggestionRow({
	row,
	chosen,
	onChosen,
}: {
	row: Suggestion;
	chosen: boolean;
	onChosen: (chosen: boolean) => void;
}) {
	const money = useMoney();
	const label = `${row.brand} ${row.name}`;
	const figures = [
		m.admin_inventory_reorder_stock({ count: row.onHand }),
		row.daysOfCover !== null &&
			m.admin_inventory_reorder_cover_days({ count: row.daysOfCover }),
		row.ratePerWeek > 0 &&
			m.admin_inventory_reorder_rate({ count: row.ratePerWeek }),
		row.suggestedQuantity !== row.orderQuantity &&
			m.admin_inventory_reorder_suggested({ count: row.suggestedQuantity }),
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<li className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 border-b p-admin-card last:border-b-0">
			<Checkbox
				checked={chosen}
				onCheckedChange={(next) => onChosen(next === true)}
				aria-label={m.admin_inventory_reorder_pick({ product: label })}
				className="mt-0.5 rounded-sm"
			/>
			<div className="grid gap-0.5">
				<span className="type-small">{label}</span>
				<span className="type-meta text-muted-foreground">
					{row.sku} · {figures}
				</span>
				{row.reasons.length > 0 && (
					<span className="type-meta text-muted-foreground">
						{row.reasons
							.map((reason) => reorderReasonLabel[reason]())
							.join(" · ")}
					</span>
				)}
			</div>
			<div className="grid justify-items-end">
				<span className="type-small font-bold tabular-nums">
					{m.admin_inventory_reorder_order({ count: row.orderQuantity })}
				</span>
				<span className="type-meta text-muted-foreground tabular-nums">
					{row.unitCost === null
						? m.admin_inventory_reorder_no_cost()
						: money(row.orderQuantity * row.unitCost)}
				</span>
			</div>
		</li>
	);
}

function SupplierGroup({
	group,
	search,
	excluded,
	onChosen,
}: {
	group: { supplier: Suggestion["supplier"]; rows: Suggestion[] };
	search: ReorderSearch;
	excluded: ReadonlySet<number>;
	onChosen: (variantId: number, chosen: boolean) => void;
}) {
	const navigate = useNavigate();
	const refresh = useRefreshAfterStockChange();
	const money = useMoney();
	const { supplier, rows } = group;
	const chosen = rows.filter((row) => !excluded.has(row.variantId));

	const create = useMutation({
		mutationFn: (supplierId: number) =>
			parseResponse(
				api().admin["purchase-orders"]["from-reorder"].$post({
					json: {
						...search,
						supplierId,
						variantIds: chosen.map((row) => row.variantId),
					},
				}),
			),
		onSuccess: async (draft) => {
			await refresh();
			await navigate({ to: "/admin/purchases/$id", params: { id: draft.id } });
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	return (
		<Section
			title={
				supplier ? (
					<Link
						to="/admin/suppliers/$id"
						params={{ id: supplier.supplierId }}
						className="underline-offset-4 hover:underline"
					>
						{supplier.supplier}
					</Link>
				) : (
					m.admin_inventory_reorder_no_supplier()
				)
			}
			description={
				supplier
					? [
							supplier.leadTimeDays !== null &&
								m.admin_inventory_reorder_lead({
									count: supplier.leadTimeDays,
								}),
							m.admin_inventory_reorder_selected({ count: chosen.length }),
							m.admin_inventory_reorder_cost({
								amount: money(estimatedCost(chosen)),
							}),
						]
							.filter(Boolean)
							.join(" · ")
					: m.admin_inventory_reorder_no_supplier_hint()
			}
			action={
				supplier && (
					<div className="grid justify-items-end gap-1">
						<Button
							size="sm"
							disabled={
								chosen.length === 0 ||
								chosen.length > MAX_DRAFT_LINES ||
								create.isPending
							}
							onClick={() => create.mutate(supplier.supplierId)}
						>
							{create.isPending && <Spinner aria-hidden />}
							{m.admin_inventory_reorder_create()}
						</Button>
						{chosen.length > MAX_DRAFT_LINES && (
							<span className="type-meta text-destructive">
								{m.admin_inventory_reorder_too_many({ max: MAX_DRAFT_LINES })}
							</span>
						)}
					</div>
				)
			}
		>
			<ul>
				{rows.map((row) => (
					<SuggestionRow
						key={row.variantId}
						row={row}
						chosen={!excluded.has(row.variantId)}
						onChosen={(next) => onChosen(row.variantId, next)}
					/>
				))}
			</ul>
		</Section>
	);
}

export function ReorderView({
	search,
	onSearchChange,
}: {
	search: ReorderSearch;
	onSearchChange: (change: Partial<ReorderSearch>) => void;
}) {
	const query = useQuery({
		...reorderQuery(search),
		placeholderData: keepPreviousData,
	});
	const groups = query.data && groupSuggestions(query.data.variants);
	// Every size starts chosen; the ones taken off are kept by id.
	const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
	const setChosen = (variantId: number, chosen: boolean) =>
		setExcluded((previous) => {
			const next = new Set(previous);
			if (chosen) next.delete(variantId);
			else next.add(variantId);
			return next;
		});

	return (
		<div className="grid gap-4">
			<p className="type-small text-muted-foreground">
				{m.admin_inventory_reorder_help()}
			</p>
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
				<WeeksSelect
					label={m.admin_inventory_reorder_lookback()}
					presets={LOOKBACK_WEEKS}
					value={search.lookbackWeeks}
					onChange={(lookbackWeeks) => onSearchChange({ lookbackWeeks })}
				/>
				<WeeksSelect
					label={m.admin_inventory_reorder_cover()}
					presets={COVER_WEEKS}
					value={search.targetWeeks}
					onChange={(targetWeeks) => onSearchChange({ targetWeeks })}
				/>
			</div>
			{query.isPending && (
				<div aria-busy className="grid gap-4">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			)}
			{query.isError && (
				<Alert variant="destructive">
					<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
						{errorMessage(query.error)}
						<Button variant="outline" size="sm" onClick={() => query.refetch()}>
							{m.admin_table_retry()}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{groups?.length === 0 && (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{m.admin_inventory_reorder_empty()}</EmptyTitle>
						<EmptyDescription>
							{m.admin_inventory_reorder_empty_hint()}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
			{groups?.map((group) => (
				<SupplierGroup
					key={group.supplier?.supplierId ?? "none"}
					group={group}
					search={search}
					excluded={excluded}
					onChosen={setChosen}
				/>
			))}
		</div>
	);
}
