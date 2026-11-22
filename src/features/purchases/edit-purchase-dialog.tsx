import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { SizePicker } from "#/components/admin/size-picker";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoney, useMoneyInput } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import { useRefreshAfterPurchaseChange } from "./mutations";
import { PurchaseLineRow } from "./purchase-line-row";
import {
	checkPurchaseLines,
	lineFieldOf,
	linesTotal,
	type PurchaseLine,
	toRequestItems,
} from "./purchase-lines";
import type { Purchase } from "./queries";
import { choiceOfTax, taxOfChoice, taxOptions } from "./tax";

const FIELD_OF = {
	reference: "reference",
	taxIncluded: "tax",
	notes: "notes",
} as const;
const fieldOf = (path: string) =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: lineFieldOf(path);

export function EditPurchaseDialog({
	purchase,
	onClose,
}: {
	purchase: Purchase;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterPurchaseChange();
	const money = useMoney();
	const moneyInput = useMoneyInput();

	const schema = z
		.object({
			reference: z.string().trim().min(1, m.admin_required()).max(40),
			tax: z.enum(["", "included", "excluded"]),
			notes: z.string().trim().max(1000),
			lines: z.array(
				z.object({
					id: z.number().nullable(),
					variantId: z.number(),
					sku: z.string(),
					label: z.string(),
					quantity: z.string(),
					unitCost: z.string(),
				}),
			),
		})
		.superRefine((value, ctx) =>
			checkPurchaseLines(value.lines, ctx, moneyInput.parse),
		);

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin["purchase-orders"][":id"].$patch({
					param: { id: String(purchase.id) },
					json: {
						reference: value.reference,
						taxIncluded: taxOfChoice(value.tax),
						notes: value.notes || null,
						items: toRequestItems(value.lines, moneyInput.parse),
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
			reference: purchase.reference,
			tax: choiceOfTax(purchase.taxIncluded),
			notes: purchase.notes ?? "",
			lines: purchase.items.map(
				(item): PurchaseLine => ({
					id: item.id,
					variantId: item.variantId,
					sku: item.sku,
					label: variantLabel(item),
					quantity: String(item.quantity),
					unitCost: moneyInput.toInput(item.unitCost),
				}),
			),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});
	const lines = useStore(form.store, (state) => state.values.lines);

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-3xl"
			title={m.admin_purchase_edit_title({ reference: purchase.reference })}
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
					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField name="reference">
							{(field) => (
								<field.TextField
									label={m.admin_purchase_reference()}
									maxLength={40}
								/>
							)}
						</form.AppField>
						<form.AppField name="tax">
							{(field) => (
								<field.SelectField
									label={m.admin_purchase_tax()}
									options={taxOptions()}
								/>
							)}
						</form.AppField>
					</div>
					<SizePicker
						picked={new Set(lines.map((line) => line.variantId))}
						placeholder={m.admin_purchase_find_size()}
						onPick={(size) =>
							form.pushFieldValue("lines", {
								id: null,
								variantId: size.variantId,
								sku: size.sku,
								label: size.label,
								quantity: "1",
								unitCost: "",
							})
						}
					/>
					<form.AppField name="lines" mode="array">
						{(list) => (
							<ul className="rounded-md border">
								{list.state.value.map((line, index) => (
									<PurchaseLineRow
										key={line.id ?? `new-${line.variantId}`}
										label={line.label}
										sku={line.sku}
										total={money(linesTotal([line], moneyInput.parse))}
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
										unitCost={
											<form.AppField name={`lines[${index}].unitCost`}>
												{(field) => (
													<field.MoneyField
														label={m.admin_purchase_unit_cost()}
													/>
												)}
											</form.AppField>
										}
									/>
								))}
							</ul>
						)}
					</form.AppField>
					<p className="flex justify-between font-bold tabular-nums">
						<span>{m.admin_order_total()}</span>
						<span>{money(linesTotal(lines, moneyInput.parse))}</span>
					</p>
					<form.AppField name="notes">
						{(field) => (
							<field.TextareaField
								label={m.admin_supplier_field_notes()}
								maxLength={1000}
							/>
						)}
					</form.AppField>
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
