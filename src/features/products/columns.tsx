import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ImageIcon, MoreHorizontalIcon } from "lucide-react";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { useStaffAccess } from "#/components/admin/staff-access";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { useProductStatus } from "./mutations";
import type { ProductRow } from "./queries";
import { ProductStatusBadge } from "./status-badge";

const column = createColumnHelper<ListFeatures, ProductRow>();

function Thumbnail({ url }: { url: string | null }) {
	return url ? (
		<img
			src={url}
			alt=""
			loading="lazy"
			className="size-10 shrink-0 rounded-md border object-cover"
		/>
	) : (
		<span className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
			<ImageIcon aria-hidden className="size-4" />
		</span>
	);
}

// Archived products are restored from their page, not from here.
function RowActions({ product }: { product: ProductRow }) {
	const change = useProductStatus();
	const name = product.name;
	if (!useStaffAccess().canWrite("catalog")) return null;
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={m.admin_product_row_actions({ name })}
				>
					<MoreHorizontalIcon aria-hidden />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem asChild>
					<Link to="/admin/products/$id" params={{ id: product.id }}>
						{m.admin_edit()}
					</Link>
				</DropdownMenuItem>
				{product.status === "draft" && (
					<DropdownMenuItem
						disabled={change.isPending}
						onSelect={() =>
							change.mutate({ id: product.id, status: "published" })
						}
					>
						{m.admin_product_publish()}
					</DropdownMenuItem>
				)}
				{product.status === "published" && (
					<DropdownMenuItem
						disabled={change.isPending}
						onSelect={() => change.mutate({ id: product.id, status: "draft" })}
					>
						{m.admin_product_unpublish()}
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// Column ids are the sorts the API accepts (PRODUCT_SORTS).
export function useProductColumns() {
	const money = useMoney();
	const formatDate = useStoreDate();
	return column.columns([
		column.accessor("name", {
			header: m.admin_col_product(),
			cell: ({ row }) => (
				<div className="flex items-center gap-3">
					<Thumbnail url={row.original.photoUrl} />
					<div className="grid min-w-0">
						<Link
							to="/admin/products/$id"
							params={{ id: row.original.id }}
							className="truncate font-bold underline-offset-4 hover:underline"
						>
							{row.original.name}
						</Link>
						<span className="type-meta text-muted-foreground md:hidden">
							{row.original.brand}
						</span>
					</div>
				</div>
			),
		}),
		column.accessor("brand", {
			header: m.admin_product_col_brand(),
			meta: { hideOnMobile: true },
		}),
		column.accessor("category", {
			header: m.admin_product_col_category(),
			enableSorting: false,
			meta: { hideOnMobile: true },
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			cell: ({ getValue }) => <ProductStatusBadge status={getValue()} />,
		}),
		column.accessor("priceFrom", {
			header: m.admin_col_price(),
			meta: { align: "right" },
			cell: ({ row }) => {
				const { variantCount, priceFrom, priceTo } = row.original;
				return (
					<div className="grid tabular-nums">
						{priceFrom === null || priceTo === null ? (
							<span className="text-muted-foreground">
								{m.admin_no_price()}
							</span>
						) : (
							<span>
								{priceFrom === priceTo
									? money(priceFrom)
									: `${money(priceFrom)} - ${money(priceTo)}`}
							</span>
						)}
						<span className="type-meta text-muted-foreground">
							{m.admin_product_sizes_n({ count: variantCount })}
						</span>
					</div>
				);
			},
		}),
		column.accessor("stock", {
			header: m.admin_col_stock(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("createdAt", {
			header: m.admin_product_col_created(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => formatDate(getValue(), { dateStyle: "medium" }),
		}),
		column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_product_actions()}</span>
			),
			enableSorting: false,
			cell: ({ row }) => <RowActions product={row.original} />,
		}),
	]);
}
