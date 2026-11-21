import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { supplierStatusLabel } from "#/components/admin/labels";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { m } from "#/paraglide/messages";
import type { SupplierRow } from "./queries";

const column = createColumnHelper<ListFeatures, SupplierRow>();

// Column ids are the sorts the API accepts (SUPPLIER_SORTS).
export function supplierColumns({
	onEdit,
	onStatus,
}: {
	onEdit: (supplier: SupplierRow) => void;
	onStatus: (supplier: SupplierRow) => void;
}) {
	return column.columns([
		column.accessor("name", {
			header: m.admin_supplier_col_supplier(),
			cell: ({ row }) => (
				<Link
					to="/admin/suppliers/$id"
					params={{ id: row.original.id }}
					className="font-bold underline-offset-4 hover:underline"
				>
					{row.original.name}
				</Link>
			),
		}),
		column.display({
			id: "contact",
			header: m.admin_supplier_col_contact(),
			meta: { hideOnMobile: true },
			cell: ({ row }) => (
				<div className="grid">
					<span>{row.original.contactName}</span>
					<span className="type-meta text-muted-foreground">
						{row.original.phoneE164 ?? row.original.email}
					</span>
				</div>
			),
		}),
		column.accessor("leadTimeDays", {
			header: m.admin_supplier_col_lead_time(),
			meta: { hideOnMobile: true, align: "right" },
			cell: ({ getValue }) => {
				const days = getValue();
				return days === null ? (
					<span className="text-muted-foreground">
						{m.admin_supplier_lead_unknown()}
					</span>
				) : (
					m.admin_supplier_lead_days({ count: days })
				);
			},
		}),
		column.accessor("openPurchaseOrders", {
			header: m.admin_supplier_col_open(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			enableSorting: false,
			cell: ({ getValue }) => {
				const status = getValue();
				return (
					<Badge variant={status === "active" ? "default" : "outline"}>
						{supplierStatusLabel[status]()}
					</Badge>
				);
			},
		}),
		column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_supplier_actions()}</span>
			),
			meta: { align: "right" },
			cell: ({ row }) => {
				const supplier = row.original;
				return (
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={m.admin_supplier_actions_for({
									name: supplier.name,
								})}
							>
								<MoreHorizontalIcon aria-hidden />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => onEdit(supplier)}>
								{m.admin_edit()}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => onStatus(supplier)}>
								{supplier.status === "active"
									? m.admin_supplier_archive()
									: m.admin_supplier_restore()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		}),
	]);
}
