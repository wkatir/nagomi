import { useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Section } from "#/components/admin/section";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import { useSupplierItemStatus } from "./mutations";
import {
	type Supplier,
	type SupplierItem,
	supplierItemsQuery,
} from "./queries";
import { SupplierItemDialog } from "./supplier-item-dialog";

export function SupplierItems({ supplier }: { supplier: Supplier }) {
	const { data: items } = useSuspenseQuery(supplierItemsQuery(supplier.id));
	const status = useSupplierItemStatus(supplier.id);
	const [editing, setEditing] = useState<SupplierItem | null | undefined>();
	const active = supplier.status === "active";
	const add = () => setEditing(null);

	return (
		<Section
			title={m.admin_supplier_items()}
			action={
				active &&
				items.length > 0 && (
					<Button size="sm" variant="outline" onClick={add}>
						<PlusIcon aria-hidden />
						{m.admin_supplier_item_new()}
					</Button>
				)
			}
		>
			{items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{m.admin_supplier_items_empty()}</EmptyTitle>
						<EmptyDescription>
							{m.admin_supplier_items_empty_hint()}
						</EmptyDescription>
					</EmptyHeader>
					{active && (
						<EmptyContent>
							<Button onClick={add}>
								<PlusIcon aria-hidden />
								{m.admin_supplier_item_new()}
							</Button>
						</EmptyContent>
					)}
				</Empty>
			) : (
				<ul>
					{items.map((item) => {
						const label = variantLabel(item);
						const archived = item.status === "archived";
						const details = [
							item.sku,
							item.supplierSku &&
								m.admin_supplier_item_code({ code: item.supplierSku }),
							item.packSize !== null &&
								m.admin_supplier_item_pack({ count: item.packSize }),
							item.minOrderQuantity !== null &&
								m.admin_supplier_item_minimum({ count: item.minOrderQuantity }),
						]
							.filter(Boolean)
							.join(" · ");
						return (
							<li
								key={item.id}
								data-archived={archived}
								className="flex items-start justify-between gap-3 border-b p-admin-card last:border-b-0 data-[archived=true]:opacity-60"
							>
								<div className="grid gap-0.5">
									<span className="type-small">
										{label}
										{item.isPreferred && (
											<Badge variant="secondary" className="ml-2">
												{m.admin_supplier_item_preferred()}
											</Badge>
										)}
										{archived && (
											<Badge variant="outline" className="ml-2">
												{m.admin_supplier_status_archived()}
											</Badge>
										)}
									</span>
									<span className="type-meta text-muted-foreground">
										{details}
									</span>
								</div>
								{active && (
									<DropdownMenu modal={false}>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={m.admin_supplier_item_actions({
													name: label,
												})}
											>
												<MoreHorizontalIcon aria-hidden />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											{!archived && (
												<DropdownMenuItem onSelect={() => setEditing(item)}>
													{m.admin_edit()}
												</DropdownMenuItem>
											)}
											<DropdownMenuItem
												onSelect={() =>
													status.mutate({
														itemId: item.id,
														status: archived ? "active" : "archived",
													})
												}
											>
												{archived
													? m.admin_supplier_restore()
													: m.admin_supplier_archive()}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{editing !== undefined && (
				<SupplierItemDialog
					supplierId={supplier.id}
					item={editing}
					onClose={() => setEditing(undefined)}
				/>
			)}
		</Section>
	);
}
