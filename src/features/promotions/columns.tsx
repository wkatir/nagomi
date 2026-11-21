import { useSuspenseQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { RowActions } from "#/components/admin/data-table/row-actions";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { promotionStatusLabel } from "#/components/admin/labels";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { DropdownMenuItem } from "#/components/ui/dropdown-menu";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import type { PromotionStatus } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { usePromotionStatus } from "./mutations";
import type { AdminPromotion } from "./queries";

const column = createColumnHelper<ListFeatures, AdminPromotion>();

// Restoring brings a promotion back off, so it does not start applying by surprise.
export const statusMoves: Record<
	PromotionStatus,
	readonly { to: PromotionStatus; label: () => string }[]
> = {
	active: [
		{ to: "inactive", label: m.admin_promotion_deactivate },
		{ to: "archived", label: m.admin_promotion_archive },
	],
	inactive: [
		{ to: "active", label: m.admin_promotion_activate },
		{ to: "archived", label: m.admin_promotion_archive },
	],
	archived: [{ to: "inactive", label: m.admin_promotion_restore }],
};

function RowMenu({
	promotion,
	onEdit,
}: {
	promotion: AdminPromotion;
	onEdit: (promotion: AdminPromotion) => void;
}) {
	const change = usePromotionStatus();
	return (
		<RowActions label={m.admin_promotion_row_actions({ code: promotion.code })}>
			<DropdownMenuItem onSelect={() => onEdit(promotion)}>
				{m.admin_edit()}
			</DropdownMenuItem>
			{statusMoves[promotion.status].map((move) => (
				<DropdownMenuItem
					key={move.to}
					disabled={change.isPending}
					onSelect={() => change.mutate({ promotion, status: move.to })}
				>
					{move.label()}
				</DropdownMenuItem>
			))}
		</RowActions>
	);
}

// Column ids are the sorts the API accepts (PROMOTION_SORTS).
export function usePromotionColumns({
	onEdit,
}: {
	onEdit: (promotion: AdminPromotion) => void;
}) {
	const money = useMoney();
	const formatDay = useCalendarDate();
	const formatDate = useStoreDate();
	const { data: store } = useSuspenseQuery(storeQuery);
	const day = (value: string | null) =>
		value ? (
			formatDay(value)
		) : (
			<span className="text-muted-foreground">
				{m.admin_promotion_no_date()}
			</span>
		);
	return column.columns([
		column.accessor("code", {
			header: m.admin_promotion_col_code(),
			cell: ({ row }) => {
				const promotion = row.original;
				const description = promotion.translations.find(
					(t) => t.locale === store.defaultLocale,
				)?.description;
				return (
					<div className="grid justify-items-start">
						<Button
							variant="link"
							className="h-auto p-0 font-bold"
							onClick={() => onEdit(promotion)}
						>
							{promotion.code}
						</Button>
						{description && (
							<span className="type-meta text-muted-foreground">
								{description}
							</span>
						)}
					</div>
				);
			},
		}),
		column.display({
			id: "discount",
			header: m.admin_promotion_col_discount(),
			cell: ({ row }) => {
				const promotion = row.original;
				return (
					<div className="grid">
						<span>
							{promotion.type === "percentage"
								? m.admin_promotion_percent_off({ value: promotion.value })
								: m.admin_promotion_amount_off({
										amount: money(promotion.value),
									})}
						</span>
						{promotion.minSubtotal !== null && (
							<span className="type-meta text-muted-foreground">
								{m.admin_promotion_minimum({
									amount: money(promotion.minSubtotal),
								})}
							</span>
						)}
					</div>
				);
			},
		}),
		column.accessor("startsOn", {
			header: m.admin_promotion_col_starts(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => day(getValue()),
		}),
		column.accessor("endsOn", {
			header: m.admin_promotion_col_ends(),
			cell: ({ getValue }) => day(getValue()),
		}),
		column.accessor("usage", {
			header: m.admin_promotion_col_usage(),
			meta: { align: "right" },
			cell: ({ row }) => (
				<span className="tabular-nums">
					{row.original.usageLimit === null
						? row.original.usage
						: m.admin_promotion_usage_of({
								used: row.original.usage,
								limit: row.original.usageLimit,
							})}
				</span>
			),
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			enableSorting: false,
			cell: ({ getValue }) => {
				const status = getValue();
				return (
					<Badge
						variant={
							status === "active"
								? "default"
								: status === "inactive"
									? "secondary"
									: "outline"
						}
					>
						{promotionStatusLabel[status]()}
					</Badge>
				);
			},
		}),
		column.accessor("createdAt", {
			header: m.admin_promotion_col_created(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => formatDate(getValue(), { dateStyle: "medium" }),
		}),
		column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_promotion_col_actions()}</span>
			),
			meta: { align: "right" },
			cell: ({ row }) => <RowMenu promotion={row.original} onEdit={onEdit} />,
		}),
	]);
}
