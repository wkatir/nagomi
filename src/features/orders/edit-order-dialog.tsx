import { useStore } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoney } from "#/hooks/use-money";
import { type AdminOrder, api, parseResponse } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { formatSize } from "#/lib/size";
import { m } from "#/paraglide/messages";
import { useRefreshAfterOrderChange } from "./mutations";
import { OrderLineRow } from "./order-line-row";
import { VariantPicker } from "./variant-picker";

type EditLine = {
	variantId: number;
	label: string;
	price: number;
	// The store's limit per line, or the stock for a line just added.
	max: number;
	quantity: string;
};

// Kept lines keep their price; added lines take the published one.
export function EditOrderDialog({
	detail,
	onClose,
}: {
	detail: AdminOrder;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterOrderChange();
	const money = useMoney();
	const { data: store } = useSuspenseQuery(storeQuery);
	const { order } = detail;

	const schema = z
		.object({
			lines: z
				.array(
					z.object({
						variantId: z.number(),
						label: z.string(),
						price: z.number(),
						max: z.number(),
						quantity: z.string(),
					}),
				)
				.superRefine((lines, ctx) => {
					lines.forEach((line, index) => {
						const quantity = Number(line.quantity);
						if (
							!/^\d+$/.test(line.quantity.trim()) ||
							quantity < 1 ||
							quantity > line.max
						)
							ctx.addIssue({
								code: "custom",
								path: [index, "quantity"],
								message: m.admin_order_quantity_invalid({ max: line.max }),
							});
					});
				}),
			notes: z.string().trim().max(500),
			removePromotion: z.boolean(),
		})
		.superRefine((value, ctx) => {
			if (value.lines.length === 0)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.admin_order_needs_lines(),
				});
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.orders[":id"].$patch({
					param: { id: String(order.id) },
					json: {
						items: value.lines.map((line) => ({
							variantId: line.variantId,
							quantity: Number(line.quantity),
						})),
						notes: value.notes || null,
						removePromotion: value.removePromotion ? true : undefined,
					},
				}),
			),
		onSuccess: async () => {
			await refresh();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			lines: detail.lines.map(
				(line): EditLine => ({
					variantId: line.variantId,
					label: [
						line.brandName,
						line.name,
						line.sizeValue !== null && line.sizeUnit
							? formatSize({ value: line.sizeValue, unit: line.sizeUnit })
							: null,
					]
						.filter(Boolean)
						.join(" "),
					price: line.unitPrice,
					max: store.maxQuantityPerLine,
					quantity: String(line.quantity),
				}),
			),
			notes: order.notes ?? "",
			removePromotion: false,
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, (path) =>
						path === "notes" ? "notes" : undefined,
					);
				}
			},
		},
	});
	const lines = useStore(form.store, (state) => state.values.lines);

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-2xl"
			title={m.admin_order_edit_title({ code: order.code })}
		>
			<form
				noValidate
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.AppForm>
					<VariantPicker
						picked={new Set(lines.map((line) => line.variantId))}
						onPick={(variant) =>
							form.pushFieldValue("lines", {
								variantId: variant.variantId,
								label: variant.label,
								price: variant.price,
								max: Math.min(variant.available, store.maxQuantityPerLine),
								quantity: "1",
							})
						}
					/>
					<form.AppField name="lines" mode="array">
						{(list) => (
							<>
								{list.state.value.map((line, index) => (
									<OrderLineRow
										key={line.variantId}
										label={line.label}
										hint={money(line.price)}
										onRemove={() => list.removeValue(index)}
										quantity={
											<form.AppField name={`lines[${index}].quantity`}>
												{(field) => (
													<field.TextField
														label={m.admin_quantity()}
														inputMode="numeric"
													/>
												)}
											</form.AppField>
										}
									/>
								))}
							</>
						)}
					</form.AppField>
					<form.AppField name="notes">
						{(field) => (
							<field.TextareaField
								label={m.admin_order_notes()}
								maxLength={500}
							/>
						)}
					</form.AppField>
					{order.promotionCode && (
						<form.AppField name="removePromotion">
							{(field) => (
								<field.CheckboxField
									label={m.admin_order_remove_promotion({
										code: order.promotionCode ?? "",
									})}
								/>
							)}
						</form.AppField>
					)}
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_save()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
