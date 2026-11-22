import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type { ArchivableStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { RowActions } from "./row-actions";
import { archivableStatusLabel } from "./status-labels";

type Row = {
	id: number;
	slug: string;
	name: string | null;
	products: number;
	status: ArchivableStatus;
};

export type ArchivableActions = {
	onEdit: (id: number) => void;
	onStatus: (id: number, status: ArchivableStatus) => void;
};

// Column ids are the sorts the API accepts.
export function archivableColumns<R extends Row>({
	onEdit,
	onStatus,
}: ArchivableActions) {
	const column = createColumnHelper<ListFeatures, R>();
	return {
		name: column.accessor((row) => row.name ?? "", {
			id: "name",
			header: m.admin_field_name(),
			cell: ({ row }) => (
				<Button
					variant="link"
					className="h-auto p-0 font-bold"
					onClick={() => onEdit(row.original.id)}
				>
					{row.original.name ?? (
						<span className="font-normal text-muted-foreground">
							{m.admin_merch_no_name()}
						</span>
					)}
				</Button>
			),
		}),
		slug: column.accessor((row) => row.slug, {
			id: "slug",
			header: m.admin_merch_col_slug(),
			enableSorting: false,
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="text-muted-foreground">{getValue()}</span>
			),
		}),
		products: column.accessor((row) => row.products, {
			id: "products",
			header: m.admin_merch_col_products(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		status: column.accessor((row) => row.status, {
			id: "status",
			header: m.admin_col_status(),
			cell: ({ getValue }) => {
				const status = getValue();
				return (
					<Badge variant={status === "active" ? "default" : "outline"}>
						{archivableStatusLabel[status]()}
					</Badge>
				);
			},
		}),
		actions: column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_merch_col_actions()}</span>
			),
			meta: { align: "right" },
			cell: ({ row }) => {
				const { id, name, slug, status } = row.original;
				return (
					<RowActions
						name={name ?? slug}
						onEdit={() => onEdit(id)}
						onArchive={
							status === "active" ? () => onStatus(id, "archived") : undefined
						}
						onRestore={
							status === "archived" ? () => onStatus(id, "active") : undefined
						}
					/>
				);
			},
		}),
	};
}
