import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { useMoney } from "#/hooks/use-money";
import { sizeLabel } from "#/lib/size-label";
import { m } from "#/paraglide/messages";
import type { LotRow } from "./queries";

const column = createColumnHelper<ListFeatures, LotRow>();

export const lotName = (lot: Pick<LotRow, "code" | "lotId">) =>
	lot.code ?? `#${lot.lotId}`;

// Column ids are the sorts the API accepts (LOT_SORTS).
export function useLotColumns({
	onAdjust,
}: {
	onAdjust: (lot: LotRow) => void;
}) {
	const money = useMoney();
	return column.columns([
		column.accessor("expiresOn", {
			header: m.admin_expiry(),
			cell: ({ row }) => {
				const lot = row.original;
				return (
					<div className="grid">
						<span className="tabular-nums">{lot.expiry}</span>
						{lot.expired ? (
							<Badge variant="destructive" className="w-fit">
								{m.admin_lot_expired()}
							</Badge>
						) : (
							<span
								data-soon={lot.expiringSoon}
								className="type-meta text-muted-foreground data-[soon=true]:text-warning"
							>
								{m.admin_days_left({ count: lot.daysLeft })}
							</span>
						)}
					</div>
				);
			},
		}),
		column.accessor((lot) => sizeLabel(lot), {
			id: "product",
			header: m.admin_col_product(),
			cell: ({ row }) => (
				<div className="grid">
					<span className="font-bold">{sizeLabel(row.original)}</span>
					<span className="type-meta text-muted-foreground">
						{row.original.sku}
					</span>
				</div>
			),
		}),
		column.accessor("code", {
			header: m.admin_lot_col_lot(),
			meta: { hideOnMobile: true },
			cell: ({ row }) =>
				row.original.code ?? (
					<span className="text-muted-foreground">{m.admin_lot_no_code()}</span>
				),
		}),
		column.accessor("available", {
			header: m.admin_lot_col_units(),
			meta: { align: "right" },
			cell: ({ row }) => (
				<div className="grid justify-items-end tabular-nums">
					<span className="font-bold">{row.original.available}</span>
					<span className="type-meta text-muted-foreground">
						{m.admin_lot_units_of({
							available: row.original.available,
							received: row.original.received,
						})}
					</span>
				</div>
			),
		}),
		column.accessor("unitCost", {
			header: m.admin_col_cost(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.accessor("value", {
			header: m.admin_lot_col_value(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.display({
			id: "purchase",
			header: m.admin_lot_col_purchase(),
			meta: { hideOnMobile: true },
			cell: ({ row }) => (
				<Link
					to="/admin/purchases/$id"
					params={{ id: row.original.purchaseOrderId }}
					className="underline-offset-4 hover:underline"
				>
					{row.original.reference}
				</Link>
			),
		}),
		column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_supplier_actions()}</span>
			),
			meta: { align: "right" },
			cell: ({ row }) => (
				<Button
					variant="outline"
					size="sm"
					aria-label={m.admin_lot_adjust_label({
						name: `${sizeLabel(row.original)} ${lotName(row.original)}`,
					})}
					onClick={() => onAdjust(row.original)}
				>
					{m.admin_adjust()}
				</Button>
			),
		}),
	]);
}
