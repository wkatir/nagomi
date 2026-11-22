import { useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { HeaderActions, PageHeader } from "#/components/admin/page-header";
import { WritableFor } from "#/components/admin/staff-access";
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
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useStoreDate } from "#/hooks/use-store-date";
import type { AdminProduct } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { BasicsCard, basicsValues } from "./basics-card";
import { useProductStatus } from "./mutations";
import { OrganizationCard } from "./organization-card";
import { organizationValues } from "./organization-form";
import { PhotosCard } from "./photos-card";
import { PriceHistoryCard } from "./price-history-card";
import { SpecsCard, specsValues } from "./specs-card";
import { ProductStatusBadge } from "./status-badge";
import { StatusCard } from "./status-card";
import { productName } from "./translations";
import { TranslationsCard, translationsValues } from "./translations-card";
import { VariantsCard } from "./variants-card";

// Each card is rebuilt only when what it saved changes, so saving one keeps another's typing.
export function ProductEditor({ product }: { product: AdminProduct }) {
	const { data: store } = useSuspenseQuery(storeQuery);
	const formatDate = useStoreDate();
	const change = useProductStatus();
	const [archiving, setArchiving] = useState(false);
	const name = productName(product, store.defaultLocale);
	const move = (status: "draft" | "published" | "archived") =>
		change.mutate({ id: product.id, status });

	return (
		<WritableFor area="catalog">
			<DetailPage>
				<PageHeader
					title={name}
					badges={<ProductStatusBadge status={product.status} />}
					description={m.admin_product_updated({
						date: formatDate(product.updatedAt, {
							dateStyle: "long",
							timeStyle: "short",
						}),
					})}
					action={
						<HeaderActions>
							{product.status === "draft" && (
								<Button
									className="max-sm:flex-1"
									disabled={
										change.isPending || product.publishMissing.length > 0
									}
									onClick={() => move("published")}
								>
									{m.admin_product_publish()}
								</Button>
							)}
							{product.status === "published" && (
								<Button
									variant="outline"
									className="max-sm:flex-1"
									disabled={change.isPending}
									onClick={() => move("draft")}
								>
									{m.admin_product_unpublish()}
								</Button>
							)}
							<DropdownMenu modal={false}>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="icon"
										aria-label={m.admin_order_more_actions()}
									>
										<MoreHorizontalIcon aria-hidden />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{product.status === "archived" ? (
										<DropdownMenuItem
											disabled={change.isPending}
											onSelect={() => move("draft")}
										>
											{m.admin_product_restore()}
										</DropdownMenuItem>
									) : (
										<DropdownMenuItem
											variant="destructive"
											onSelect={() => setArchiving(true)}
										>
											{m.admin_product_archive()}
										</DropdownMenuItem>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</HeaderActions>
					}
				/>
				<DetailColumns
					aside={
						<>
							<StatusCard product={product} />
							<OrganizationCard
								key={JSON.stringify(organizationValues(product))}
								product={product}
							/>
						</>
					}
				>
					<BasicsCard
						key={JSON.stringify(basicsValues(product))}
						product={product}
					/>
					<TranslationsCard
						key={JSON.stringify(translationsValues(product))}
						product={product}
					/>
					<SpecsCard
						key={JSON.stringify(specsValues(product))}
						product={product}
					/>
					<VariantsCard product={product} />
					<PriceHistoryCard product={product} />
					<PhotosCard product={product} />
				</DetailColumns>
				{archiving && (
					<AlertDialog
						open
						onOpenChange={(open) => !open && setArchiving(false)}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									{m.admin_product_archive_title({ name })}
								</AlertDialogTitle>
								<AlertDialogDescription>
									{m.admin_product_archive_body()}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{m.admin_cancel()}</AlertDialogCancel>
								<AlertDialogAction onClick={() => move("archived")}>
									{m.admin_product_archive()}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				)}
			</DetailPage>
		</WritableFor>
	);
}
