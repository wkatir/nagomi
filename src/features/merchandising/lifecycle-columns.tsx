import { createColumnHelper } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { RowActions } from "./row-actions";
import { lifecycleBadge, lifecycleStatusLabel } from "./status-labels";

type Row = {
	id: number;
	slug: string;
	position: number;
	status: ProductStatus;
};

// Column ids are the sorts the API accepts.
export function lifecycleColumns<R extends Row>({
	title,
	titleOf,
	titleSort = "title",
	titleHeader = m.admin_field_title,
	onStatus,
}: {
	title: (row: R) => ReactNode;
	titleOf: (row: R) => string | null;
	titleSort?: string;
	titleHeader?: () => string;
	onStatus: (id: number, status: ProductStatus) => void;
}) {
	const column = createColumnHelper<ListFeatures, R>();
	return {
		title: column.accessor((row) => titleOf(row) ?? "", {
			id: titleSort,
			header: titleHeader(),
			cell: ({ row }) => title(row.original),
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
		position: column.accessor((row) => row.position, {
			id: "position",
			header: m.admin_merch_col_position(),
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
					<Badge variant={lifecycleBadge[status]}>
						{lifecycleStatusLabel[status]()}
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
				const { id, slug, status } = row.original;
				return (
					<RowActions
						name={titleOf(row.original) ?? slug}
						onArchive={
							status === "archived" ? undefined : () => onStatus(id, "archived")
						}
						onRestore={
							status === "archived" ? () => onStatus(id, "draft") : undefined
						}
					/>
				);
			},
		}),
	};
}
