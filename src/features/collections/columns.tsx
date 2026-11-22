import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ImageIcon } from "lucide-react";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { lifecycleColumns } from "../merchandising/lifecycle-columns";
import type { CollectionRow } from "./queries";

const column = createColumnHelper<ListFeatures, CollectionRow>();

// Column ids are the sorts the API accepts (COLLECTION_SORTS).
export const collectionColumns = (actions: {
	onStatus: (id: number, status: ProductStatus) => void;
}) => {
	const shared = lifecycleColumns<CollectionRow>({
		titleOf: (collection) => collection.title,
		title: (collection) => (
			<Link
				to="/admin/collections/$id"
				params={{ id: collection.id }}
				className="font-bold underline-offset-4 hover:underline"
			>
				{collection.title ?? (
					<span className="font-normal text-muted-foreground">
						{m.admin_merch_no_name()}
					</span>
				)}
			</Link>
		),
		onStatus: actions.onStatus,
	});
	return column.columns([
		column.display({
			id: "cover",
			header: () => (
				<span className="sr-only">{m.admin_collection_cover()}</span>
			),
			cell: ({ row }) => (
				<div className="grid size-10 place-items-center overflow-hidden rounded-md border bg-muted">
					{row.original.cover ? (
						<img
							src={row.original.cover}
							alt=""
							loading="lazy"
							className="size-full object-cover"
						/>
					) : (
						<ImageIcon aria-hidden className="text-muted-foreground" />
					)}
				</div>
			),
		}),
		shared.title,
		shared.slug,
		column.accessor("products", {
			header: m.admin_merch_col_products(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("showOnHome", {
			id: "home",
			header: m.admin_collection_col_home(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) =>
				getValue() && (
					<Badge variant="secondary">{m.admin_collection_col_home()}</Badge>
				),
		}),
		shared.position,
		shared.status,
		shared.actions,
	]);
};
