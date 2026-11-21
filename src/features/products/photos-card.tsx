import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { imageKindLabel } from "#/components/admin/labels";
import { Section } from "#/components/admin/section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { type AdminProduct, api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { useRefreshAfterProductChange } from "./mutations";
import { type Photo, PhotoDialog } from "./photo-dialog";
import { moved } from "./photo-form";

function usePhotoChanges(productId: number) {
	const refresh = useRefreshAfterProductChange();
	const options = {
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
		onError: (error: unknown) => toast.error(errorMessage(error)),
	};
	return {
		reorder: useMutation({
			mutationFn: (imageIds: number[]) =>
				parseResponse(
					api().admin["product-images"].order.$put({
						json: { productId, imageIds },
					}),
				),
			...options,
		}),
		status: useMutation({
			mutationFn: ({
				id,
				status,
			}: {
				id: number;
				status: "active" | "archived";
			}) =>
				parseResponse(
					api().admin["product-images"][":id"].$patch({
						param: { id: String(id) },
						json: { status },
					}),
				),
			...options,
		}),
	};
}

// The first photo is the cover. A photo no longer shown is archived, never deleted.
export function PhotosCard({ product }: { product: AdminProduct }) {
	const { data: store } = useSuspenseQuery(storeQuery);
	const [editing, setEditing] = useState<Photo | "new" | null>(null);
	const { reorder, status } = usePhotoChanges(product.id);
	const shown = product.images.filter((photo) => photo.status === "active");
	const archived = product.images.filter(
		(photo) => photo.status === "archived",
	);
	const busy = reorder.isPending || status.isPending;
	const sizeOf = (photo: Photo) =>
		photo.variantId === null
			? m.admin_product_photo_all_sizes()
			: (product.variants.find((size) => size.id === photo.variantId)?.sku ??
				String(photo.variantId));
	const move = (index: number, by: -1 | 1) => {
		const ids = moved(
			shown.map((photo) => photo.id),
			index,
			by,
		);
		if (ids) reorder.mutate(ids);
	};

	return (
		<Section
			title={m.admin_product_photos()}
			action={
				product.status !== "archived" && (
					<Button size="sm" variant="outline" onClick={() => setEditing("new")}>
						{m.admin_product_photo_add()}
					</Button>
				)
			}
		>
			{shown.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_product_photos_empty()}
				</p>
			) : (
				<ul>
					{shown.map((photo, index) => {
						const alt = photo.alt[store.defaultLocale];
						return (
							<li
								key={photo.id}
								className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b p-admin-card last:border-b-0 sm:grid-cols-[auto_1fr_auto]"
							>
								<img
									src={photo.url}
									alt=""
									width={photo.width}
									height={photo.height}
									loading="lazy"
									className="size-16 rounded-md border object-cover"
								/>
								<div className="grid min-w-0 gap-0.5">
									<span className="type-small truncate">
										{alt ?? (
											<span className="text-destructive">
												{m.admin_product_photo_no_alt()}
											</span>
										)}
									</span>
									<span className="type-meta text-muted-foreground">
										{imageKindLabel[photo.kind]()} · {sizeOf(photo)}
										{index === 0 && ` · ${m.admin_product_photo_cover()}`}
									</span>
								</div>
								<div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
									<Button
										size="icon-sm"
										variant="ghost"
										disabled={busy || index === 0}
										aria-label={m.admin_product_photo_up({ n: index + 1 })}
										onClick={() => move(index, -1)}
									>
										<ArrowUpIcon aria-hidden />
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										disabled={busy || index === shown.length - 1}
										aria-label={m.admin_product_photo_down({ n: index + 1 })}
										onClick={() => move(index, 1)}
									>
										<ArrowDownIcon aria-hidden />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => setEditing(photo)}
									>
										{m.admin_edit()}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										disabled={busy}
										onClick={() =>
											status.mutate({ id: photo.id, status: "archived" })
										}
									>
										{m.admin_product_archive()}
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
			{archived.length > 0 && (
				<Accordion type="single" collapsible className="border-t px-admin-card">
					<AccordionItem value="archived" className="border-b-0">
						<AccordionTrigger>
							{m.admin_product_photos_archived({ count: archived.length })}
						</AccordionTrigger>
						<AccordionContent>
							<ul className="grid gap-3">
								{archived.map((photo) => (
									<li key={photo.id} className="flex items-center gap-3">
										<img
											src={photo.url}
											alt=""
											width={photo.width}
											height={photo.height}
											loading="lazy"
											className="size-12 rounded-md border object-cover opacity-60"
										/>
										<span className="type-small min-w-0 flex-1 truncate text-muted-foreground">
											{photo.alt[store.defaultLocale] ??
												imageKindLabel[photo.kind]()}
										</span>
										<Button
											size="sm"
											variant="outline"
											disabled={busy}
											onClick={() =>
												status.mutate({ id: photo.id, status: "active" })
											}
										>
											{m.admin_product_restore()}
										</Button>
									</li>
								))}
							</ul>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			)}
			{editing && (
				<PhotoDialog
					product={product}
					photo={editing === "new" ? undefined : editing}
					onClose={() => setEditing(null)}
				/>
			)}
		</Section>
	);
}
