import { cn } from "cn";
import { useState } from "react";
import { Section } from "#/components/admin/section";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { useMoney } from "#/hooks/use-money";
import type { AdminProduct } from "#/lib/api";
import { formatSize } from "#/lib/size";
import { m } from "#/paraglide/messages";
import { useVariantStatus } from "./mutations";
import { type Size, SizeDialog } from "./size-dialog";

// A size no longer sold is archived, never deleted.
export function SizesCard({ product }: { product: AdminProduct }) {
	const money = useMoney();
	const [editing, setEditing] = useState<Size | "new" | null>(null);
	const [archiving, setArchiving] = useState<Size | null>(null);
	const change = useVariantStatus();
	const sizes = [
		...product.variants.filter((size) => size.status === "active"),
		...product.variants.filter((size) => size.status === "archived"),
	];
	return (
		<Section
			title={m.admin_product_sizes()}
			action={
				product.status !== "archived" && (
					<Button size="sm" variant="outline" onClick={() => setEditing("new")}>
						{m.admin_product_size_add()}
					</Button>
				)
			}
		>
			{sizes.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_product_sizes_empty()}
				</p>
			) : (
				<ul>
					{sizes.map((size) => {
						const archived = size.status === "archived";
						return (
							<li
								key={size.id}
								className={cn(
									"grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b p-admin-card last:border-b-0",
									archived && "text-muted-foreground",
								)}
							>
								<span className="type-small flex flex-wrap items-center gap-2">
									<span className="font-bold">
										{size.sizeValue !== null && size.sizeUnit !== null
											? formatSize({
													value: size.sizeValue,
													unit: size.sizeUnit,
												})
											: m.admin_product_size_none()}
									</span>
									<span>{size.sku}</span>
									{archived && (
										<Badge variant="outline">
											{m.admin_product_status_archived()}
										</Badge>
									)}
								</span>
								<span className="type-small text-right tabular-nums">
									{size.price === null ? (
										<span className="text-muted-foreground">
											{m.admin_no_price()}
										</span>
									) : (
										<>
											{size.compareAtPrice !== null && (
												<span className="mr-2 text-muted-foreground line-through">
													{money(size.compareAtPrice)}
												</span>
											)}
											<span className="font-bold">{money(size.price)}</span>
										</>
									)}
								</span>
								<span className="type-meta text-muted-foreground">
									{[
										size.gtin,
										m.admin_product_on_hand({ count: size.onHand }),
										size.reorderPoint === null
											? null
											: m.admin_product_reorder_at({
													count: size.reorderPoint,
												}),
									]
										.filter(Boolean)
										.join(" · ")}
								</span>
								<div className="col-span-2 flex flex-wrap gap-2 pt-1">
									{archived ? (
										<Button
											size="sm"
											variant="outline"
											disabled={change.isPending}
											onClick={() =>
												change.mutate({ id: size.id, status: "active" })
											}
										>
											{m.admin_product_restore()}
										</Button>
									) : (
										<>
											<Button
												size="sm"
												variant="outline"
												onClick={() => setEditing(size)}
											>
												{m.admin_edit()}
											</Button>
											<Button
												size="sm"
												variant="ghost"
												disabled={change.isPending}
												onClick={() =>
													size.onHand > 0
														? setArchiving(size)
														: change.mutate({ id: size.id, status: "archived" })
												}
											>
												{m.admin_product_archive()}
											</Button>
										</>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
			{editing && (
				<SizeDialog
					product={product}
					size={editing === "new" ? undefined : editing}
					onClose={() => setEditing(null)}
				/>
			)}
			{archiving && (
				<AlertDialog open onOpenChange={(open) => !open && setArchiving(null)}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{m.admin_product_size_archive_title({ sku: archiving.sku })}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{m.admin_product_size_archive_stock({
									count: archiving.onHand,
								})}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{m.admin_cancel()}</AlertDialogCancel>
							<AlertDialogAction
								onClick={() =>
									change.mutate({
										id: archiving.id,
										status: "archived",
										archiveWithStock: true,
									})
								}
							>
								{m.admin_product_archive()}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</Section>
	);
}
