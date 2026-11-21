import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Section } from "#/components/admin/section";
import { Badge } from "#/components/ui/badge";
import { api, parseResponse } from "#/lib/api";
import { PRODUCT_STATUSES } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { OrderedItem } from "../merchandising/ordered-item";
import { ProductSearch } from "../merchandising/product-search";
import { useRefresh } from "../merchandising/status-change";
import {
	lifecycleBadge,
	lifecycleStatusLabel,
} from "../merchandising/status-labels";
import { productChoices } from "./product-choices";
import { type CollectionDetail, collectionsKeys } from "./queries";

// The API's limit.
const MAX_PRODUCTS = 200;

const product = z.object({
	productId: z.number(),
	label: z.string(),
	slug: z.string(),
	status: z.enum(PRODUCT_STATUSES),
});

// Saved together: the API replaces the whole list. A product in draft or archived since it was
// added is marked, since the store shows only published products.
export function CollectionProducts({
	collection,
}: {
	collection: CollectionDetail;
}) {
	const refresh = useRefresh(collectionsKeys.all);

	const schema = z
		.object({ products: z.array(product) })
		.superRefine((value, ctx) => {
			if (value.products.length > MAX_PRODUCTS)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.admin_collection_products_max({ max: MAX_PRODUCTS }),
				});
			if (collection.status === "published" && value.products.length === 0)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.error_collection_requires_products(),
				});
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.collections[":id"].products.$put({
					param: { id: String(collection.id) },
					json: { productIds: value.products.map((item) => item.productId) },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: {
			products: collection.products.map((item) => ({
				productId: item.productId,
				label: item.name ?? item.slug,
				slug: item.slug,
				status: item.status,
			})),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, () => undefined);
				}
			},
		},
	});
	const products = useStore(form.store, (state) => state.values.products);

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<Section
					title={m.admin_collection_products()}
					action={
						<form.Subscribe selector={(state) => state.isDefaultValue}>
							{(unchanged) => (
								<form.SubmitButton
									size="sm"
									variant="outline"
									disabled={unchanged}
								>
									{m.admin_collection_save_products()}
								</form.SubmitButton>
							)}
						</form.Subscribe>
					}
				>
					<div className="grid gap-4 p-admin-card">
						<ProductSearch
							choices={productChoices}
							added={new Set(products.map((item) => item.productId))}
							onPick={(choice) =>
								form.pushFieldValue("products", {
									productId: choice.key,
									label: choice.label,
									slug: choice.hint,
									status: choice.draft ? "draft" : "published",
								})
							}
						/>
						<form.AppField name="products" mode="array">
							{(list) =>
								list.state.value.length === 0 ? (
									<p className="type-small text-muted-foreground">
										{m.admin_collection_products_empty()}
									</p>
								) : (
									<ol className="rounded-md border">
										{list.state.value.map((item, index) => (
											<OrderedItem
												key={item.productId}
												position={index + 1}
												name={item.label}
												hint={item.slug}
												note={
													item.status !== "published" && (
														<Badge variant={lifecycleBadge[item.status]}>
															{lifecycleStatusLabel[item.status]()}
														</Badge>
													)
												}
												first={index === 0}
												last={index === list.state.value.length - 1}
												onUp={() => list.moveValue(index, index - 1)}
												onDown={() => list.moveValue(index, index + 1)}
												onRemove={() => list.removeValue(index)}
											/>
										))}
									</ol>
								)
							}
						</form.AppField>
						<form.FormError />
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
