import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { RowActions } from "#/components/admin/data-table/row-actions";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import {
	channelLabel,
	orderStatusLabel,
	paymentStatusLabel,
} from "#/components/admin/labels";
import { Badge } from "#/components/ui/badge";
import { DropdownMenuItem } from "#/components/ui/dropdown-menu";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import type { AdminOrders } from "#/lib/api";
import { m } from "#/paraglide/messages";

type OrderRow = AdminOrders["items"][number];

const column = createColumnHelper<ListFeatures, OrderRow>();

// Column ids are the sorts the API accepts (ORDER_SORTS).
export function useOrderColumns() {
	const money = useMoney();
	const formatDate = useStoreDate();
	return column.columns([
		column.accessor("code", {
			header: m.admin_col_order(),
			cell: ({ row }) => (
				<Link
					to="/admin/orders/$id"
					params={{ id: row.original.id }}
					className="font-bold underline-offset-4 hover:underline"
				>
					{row.original.code}
				</Link>
			),
		}),
		column.accessor((order) => order.customerName ?? "", {
			id: "customer",
			header: m.admin_col_customer(),
			cell: ({ row }) => (
				<div className="grid">
					<span>{row.original.customerName}</span>
					<span className="type-meta text-muted-foreground">
						{row.original.customerPhone}
					</span>
				</div>
			),
		}),
		column.accessor("channel", {
			header: m.admin_col_channel(),
			enableSorting: false,
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => channelLabel[getValue()](),
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			cell: ({ getValue }) => {
				const status = getValue();
				return (
					<Badge
						variant={
							status === "pending"
								? "secondary"
								: status === "cancelled"
									? "outline"
									: "default"
						}
					>
						{orderStatusLabel[status]()}
					</Badge>
				);
			},
		}),
		column.accessor((order) => order.payment.status, {
			id: "payment",
			header: m.admin_col_payment(),
			enableSorting: false,
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => (
				<Badge variant="outline">{paymentStatusLabel[getValue()]()}</Badge>
			),
		}),
		column.accessor("total", {
			header: m.admin_col_total(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.accessor("createdAt", {
			header: m.admin_col_date(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) =>
				formatDate(getValue(), { dateStyle: "medium", timeStyle: "short" }),
		}),
		column.display({
			id: "actions",
			header: () => <span className="sr-only">{m.admin_col_actions()}</span>,
			meta: { align: "right" },
			cell: ({ row }) => {
				const o = row.original;
				const shippable =
					o.status === "paid" ||
					(o.status === "pending" && o.paymentMethod === "cash_on_delivery");
				return (
					<RowActions label={m.admin_order_more_actions()}>
						<DropdownMenuItem asChild>
							<Link to="/admin/orders/$id" params={{ id: o.id }}>
								{m.admin_order_view_detail()}
							</Link>
						</DropdownMenuItem>
						{shippable && (
							<DropdownMenuItem asChild>
								<Link
									to="/admin/orders/$id"
									params={{ id: o.id }}
									search={{ action: "ship" }}
								>
									{m.admin_order_mark_shipped()}
								</Link>
							</DropdownMenuItem>
						)}
						<DropdownMenuItem asChild>
							<Link
								to="/admin/orders/$id/receipt"
								params={{ id: String(o.id) }}
							>
								{m.admin_order_print_receipt()}
							</Link>
						</DropdownMenuItem>
					</RowActions>
				);
			},
		}),
	]);
}
