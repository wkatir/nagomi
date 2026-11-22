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
import { Input } from "#/components/ui/input";
import { api, parseResponse } from "#/lib/api";
import { BUNDLE_MAX_ITEMS, BUNDLE_MIN_ITEMS } from "#/lib/schemas/bundles";
import { m } from "#/paraglide/messages";
import { OrderedItem } from "../merchandising/ordered-item";
import { ProductSearch } from "../merchandising/product-search";
import { useRefresh } from "../merchandising/status-change";
import { type BundleDetail, bundlesKeys } from "./queries";
import { variantChoices } from "./variant-choices";

const item = z.object({
	variantId: z.number(),
	label: z.string(),
	sku: z.string(),
	archived: z.boolean(),
	quantity: z.string(),
});

// Saved together: the API replaces the whole list.
export function BundleItems({ bundle }: { bundle: BundleDetail }) {
	const refresh = useRefresh(bundlesKeys.all);

	const schema = z
		.object({ items: z.array(item) })
		.superRefine((value, ctx) => {
			if (value.items.length > BUNDLE_MAX_ITEMS)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.admin_bundle_items_max({ max: BUNDLE_MAX_ITEMS }),
				});
			if (
				(bundle.status === "published" || value.items.length > 0) &&
				value.items.length < BUNDLE_MIN_ITEMS
			)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.error_bundle_requires_two_items(),
				});
			value.items.forEach((entry, index) => {
				if (!/^[1-9]\d?$/.test(entry.quantity.trim()))
					ctx.addIssue({
						code: "custom",
						path: ["items", index, "quantity"],
						message: m.admin_bundle_quantity_invalid(),
					});
			});
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.bundles[":id"].items.$put({
					param: { id: String(bundle.id) },
					json: {
						items: value.items.map((entry) => ({
							variantId: entry.variantId,
							quantity: Number(entry.quantity),
						})),
					},
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: {
			items: bundle.items.map((entry) => ({
				variantId: entry.variantId,
				label: entry.name ?? entry.sku,
				sku: entry.sku,
				archived: entry.variantStatus !== "active",
				quantity: String(entry.quantity),
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
	const items = useStore(form.store, (state) => state.values.items);

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
					title={m.admin_bundle_items()}
					action={
						<form.Subscribe selector={(state) => state.isDefaultValue}>
							{(unchanged) => (
								<form.SubmitButton
									size="sm"
									variant="outline"
									disabled={unchanged}
								>
									{m.admin_bundle_save_items()}
								</form.SubmitButton>
							)}
						</form.Subscribe>
					}
				>
					<div className="grid gap-4 p-admin-card">
						<ProductSearch
							choices={variantChoices}
							added={new Set(items.map((item) => item.variantId))}
							onPick={(choice) =>
								form.pushFieldValue("items", {
									variantId: choice.key,
									label: choice.label,
									sku: choice.hint,
									archived: false,
									quantity: "1",
								})
							}
						/>
						<form.AppField name="items" mode="array">
							{(list) =>
								list.state.value.length === 0 ? (
									<p className="type-small text-muted-foreground">
										{m.admin_bundle_items_empty()}
									</p>
								) : (
									<ol className="rounded-md border">
										{list.state.value.map((item, index) => (
											<OrderedItem
												key={item.variantId}
												position={index + 1}
												name={item.label}
												hint={item.sku}
												note={
													<>
														{item.archived && (
															<Badge variant="outline">
																{m.admin_bundle_size_archived()}
															</Badge>
														)}
														<form.Field name={`items[${index}].quantity`}>
															{(quantity) => (
																<Input
																	className="w-16"
																	inputMode="numeric"
																	maxLength={2}
																	aria-label={m.admin_bundle_quantity({
																		name: item.label,
																	})}
																	aria-invalid={
																		quantity.state.meta.errors.length > 0
																			? true
																			: undefined
																	}
																	value={quantity.state.value}
																	onBlur={quantity.handleBlur}
																	onChange={(event) =>
																		quantity.handleChange(event.target.value)
																	}
																/>
															)}
														</form.Field>
													</>
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
