import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { PurchaseStatusBadge } from "#/components/admin/purchase-status-badge";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import type { PurchaseRow } from "./queries";

const column = createColumnHelper<ListFeatures, PurchaseRow>();

// Column ids are the sorts the API accepts (PURCHASE_SORTS).
export function usePurchaseColumns() {
	const money = useMoney();
	const formatDay = useCalendarDate();
	const formatDate = useStoreDate();
	return column.columns([
		column.accessor("reference", {
			header: m.admin_purchase_col_reference(),
			cell: ({ row }) => (
				<Link
					to="/admin/purchases/$id"
					params={{ id: row.original.id }}
					className="font-bold underline-offset-4 hover:underline"
				>
					{row.original.reference}
				</Link>
			),
		}),
		column.accessor("supplier", {
			header: m.admin_purchase_col_supplier(),
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			cell: ({ getValue }) => <PurchaseStatusBadge status={getValue()} />,
		}),
		column.display({
			id: "units",
			header: m.admin_purchase_col_units(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ row }) => {
				const { receivedUnits, units } = row.original;
				return (
					<span className="tabular-nums">
						{receivedUnits === 0
							? units
							: m.admin_po_received_units({
									received: receivedUnits,
									ordered: units,
								})}
					</span>
				);
			},
		}),
		column.accessor("total", {
			header: m.admin_col_total(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.accessor("orderedOn", {
			header: m.admin_purchase_col_ordered(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => {
				const day = getValue();
				return day === null ? (
					<span className="text-muted-foreground">
						{m.admin_purchase_not_ordered()}
					</span>
				) : (
					formatDay(day)
				);
			},
		}),
		column.accessor("createdAt", {
			header: m.admin_purchase_col_created(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => formatDate(getValue(), { dateStyle: "medium" }),
		}),
	]);
}
