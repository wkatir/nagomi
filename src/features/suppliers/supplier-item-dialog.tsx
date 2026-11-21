import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Panel } from "#/components/admin/panel";
import { SizePicker } from "#/components/admin/size-picker";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import { sizeLabel } from "#/lib/size-label";
import { m } from "#/paraglide/messages";
import { useRefreshAfterSupplierChange } from "./mutations";
import type { SupplierItem } from "./queries";

const FIELDS = ["supplierSku", "packSize", "minOrderQuantity"] as const;
type Field = (typeof FIELDS)[number];
const fieldOf = (path: string): Field | undefined =>
	FIELDS.find((field) => field === path);

const MAX_PACK_SIZE = 10_000;
const MAX_MINIMUM = 100_000;

const wholeNumber = (max: number) =>
	z
		.string()
		.trim()
		.refine(
			(text) =>
				text === "" ||
				(/^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= max),
			m.admin_supplier_item_invalid_number({ max }),
		);

const schema = z
	.object({
		// Only sent for a new product; an existing one keeps its size.
		variantId: z.number().nullable(),
		label: z.string(),
		supplierSku: z.string().trim().max(60),
		packSize: wholeNumber(MAX_PACK_SIZE),
		minOrderQuantity: wholeNumber(MAX_MINIMUM),
		isPreferred: z.boolean(),
	})
	.superRefine((value, ctx) => {
		if (value.variantId === null)
			ctx.addIssue({
				code: "custom",
				path: [],
				message: m.admin_supplier_item_pick_size(),
			});
	});

const numberOrNull = (text: string) => (text === "" ? null : Number(text));

// The preferred source is the one the reorder suggestions order from.
export function SupplierItemDialog({
	supplierId,
	item,
	onClose,
}: {
	supplierId: number;
	item: SupplierItem | null;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterSupplierChange();

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const fields = {
				supplierSku: value.supplierSku || null,
				packSize: numberOrNull(value.packSize),
				minOrderQuantity: numberOrNull(value.minOrderQuantity),
				isPreferred: value.isPreferred,
			};
			const param = { id: String(supplierId) };
			if (item)
				return parseResponse(
					api().admin.suppliers[":id"].items[":itemId"].$patch({
						param: { ...param, itemId: String(item.id) },
						json: fields,
					}),
				);
			if (value.variantId === null)
				throw new Error("A supplier product needs its size");
			return parseResponse(
				api().admin.suppliers[":id"].items.$post({
					param,
					json: { ...fields, variantId: value.variantId },
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			variantId: item?.variantId ?? (null as number | null),
			label: item ? sizeLabel(item) : "",
			supplierSku: item?.supplierSku ?? "",
			packSize: item?.packSize == null ? "" : String(item.packSize),
			minOrderQuantity:
				item?.minOrderQuantity == null ? "" : String(item.minOrderQuantity),
			isPreferred: item?.isPreferred ?? false,
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
	const chosen = useStore(form.store, (state) => state.values);

	return (
		<AdminDialog
			onClose={onClose}
			title={
				item
					? m.admin_supplier_item_edit_title({ name: sizeLabel(item) })
					: m.admin_supplier_item_new()
			}
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
					{item ? (
						<p className="type-small text-muted-foreground">
							{chosen.label} · {item.sku}
						</p>
					) : chosen.variantId === null ? (
						<SizePicker
							picked={new Set()}
							placeholder={m.admin_supplier_item_find_size()}
							onPick={(size) => {
								form.setFieldValue("variantId", size.variantId);
								form.setFieldValue("label", `${size.label} · ${size.sku}`);
							}}
						/>
					) : (
						<Panel className="flex-row items-center justify-between gap-3 px-3 py-2">
							<span className="type-small">{chosen.label}</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => form.setFieldValue("variantId", null)}
							>
								{m.admin_supplier_item_change_size()}
							</Button>
						</Panel>
					)}
					<form.AppField name="supplierSku">
						{(field) => (
							<field.TextField
								label={m.admin_supplier_item_field_code()}
								maxLength={60}
							/>
						)}
					</form.AppField>
					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField name="packSize">
							{(field) => (
								<field.TextField
									label={m.admin_supplier_item_field_pack()}
									inputMode="numeric"
								/>
							)}
						</form.AppField>
						<form.AppField name="minOrderQuantity">
							{(field) => (
								<field.TextField
									label={m.admin_supplier_item_field_minimum()}
									inputMode="numeric"
								/>
							)}
						</form.AppField>
					</div>
					<form.AppField name="isPreferred">
						{(field) => (
							<field.CheckboxField
								label={m.admin_supplier_item_field_preferred()}
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
