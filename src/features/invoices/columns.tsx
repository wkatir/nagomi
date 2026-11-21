import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { CircleAlertIcon } from "lucide-react";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import type { AdminInvoice } from "./queries";

const column = createColumnHelper<ListFeatures, AdminInvoice>();

// Column ids are the sorts the API accepts (INVOICE_SORTS); the total sorts by the expected
// total, which is what a document not yet emitted shows.
export function useInvoiceColumns() {
	const money = useMoney();
	const formatDay = useCalendarDate();
	const formatDate = useStoreDate();
	return column.columns([
		column.accessor("orderCode", {
			header: m.admin_col_order(),
			enableSorting: false,
			cell: ({ row }) => (
				<Link
					to="/admin/orders/$id"
					params={{ id: row.original.orderId }}
					className="font-bold underline-offset-4 hover:underline"
				>
					{row.original.orderCode}
				</Link>
			),
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			cell: ({ getValue }) => <InvoiceStatusBadge status={getValue()} />,
		}),
		column.accessor("controlNumber", {
			header: m.admin_invoice_control_number(),
			enableSorting: false,
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="type-meta tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("issuedOn", {
			header: m.admin_invoice_issued_on(),
			cell: ({ getValue }) => {
				const day = getValue();
				return day ? formatDay(day) : null;
			},
		}),
		column.accessor((doc) => doc.total ?? doc.expectedTotal, {
			id: "total",
			header: m.admin_col_total(),
			meta: { align: "right" },
			cell: ({ row }) => (
				<span
					className={
						row.original.total === null
							? "text-muted-foreground tabular-nums"
							: "tabular-nums"
					}
				>
					{money(row.original.total ?? row.original.expectedTotal)}
				</span>
			),
		}),
		column.accessor("createdAt", {
			header: m.admin_invoice_col_created(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) =>
				formatDate(getValue(), { dateStyle: "medium", timeStyle: "short" }),
		}),
		column.display({
			id: "problem",
			header: () => (
				<span className="sr-only">{m.admin_invoice_col_problem()}</span>
			),
			cell: ({ row }) =>
				row.original.error === null ? null : (
					<span className="inline-flex text-destructive">
						<CircleAlertIcon aria-hidden className="size-4" />
						<span className="sr-only">{m.admin_invoice_has_problem()}</span>
					</span>
				),
		}),
	]);
}
