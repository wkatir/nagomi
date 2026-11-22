import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useMoney } from "#/hooks/use-money";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import type { StockRow } from "./queries";

const column = createColumnHelper<ListFeatures, StockRow>();

// Column ids are the sorts the API accepts (STOCK_SORTS).
export function useStockColumns() {
	const money = useMoney();
	return column.columns([
		column.accessor((row) => variantLabel(row), {
			id: "product",
			header: m.admin_col_product(),
			cell: ({ row }) => (
				<div className="grid">
					<span className="font-bold">{variantLabel(row.original)}</span>
					<span className="type-meta text-muted-foreground">
						{row.original.sku}
					</span>
				</div>
			),
		}),
		column.accessor("onHand", {
			id: "onHand",
			header: m.admin_inventory_col_on_hand(),
			meta: { align: "right" },
			cell: ({ row }) => (
				<div className="grid justify-items-end tabular-nums">
					<span className="font-bold">{row.original.onHand}</span>
					{row.original.lowStock && (
						<Badge variant="outline" className="text-warning">
							{m.admin_inventory_view_low()}
						</Badge>
					)}
				</div>
			),
		}),
		column.accessor("stockValue", {
			header: m.admin_inventory_col_value(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.accessor("reorderPoint", {
			header: m.admin_inventory_col_point(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ getValue }) => {
				const point = getValue();
				return point === null ? (
					<span className="text-muted-foreground">
						{m.admin_inventory_not_set()}
					</span>
				) : (
					<span className="tabular-nums">{point}</span>
				);
			},
		}),
		column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_supplier_actions()}</span>
			),
			meta: { align: "right" },
			cell: ({ row }) => (
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={m.admin_inventory_actions_for({
								name: variantLabel(row.original),
							})}
						>
							<MoreHorizontalIcon aria-hidden />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<Link to="/admin/inventory/lots" search={{ q: row.original.sku }}>
								{m.admin_inventory_see_lots()}
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link
								to="/admin/inventory/movements"
								search={{ sku: row.original.sku }}
							>
								{m.admin_inventory_see_movements()}
							</Link>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		}),
	]);
}
