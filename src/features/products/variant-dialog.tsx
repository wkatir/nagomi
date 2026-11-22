import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoneyInput } from "#/hooks/use-money";
import { type AdminProduct, api, parseResponse } from "#/lib/api";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { useRefreshAfterProductChange } from "./mutations";
import {
	emptyVariant,
	type VariantValues,
	variantIssues,
	variantPayload,
	variantValues,
} from "./variant-form";

export type Size = AdminProduct["variants"][number];

const FIELD_OF = {
	sku: "sku",
	optionLabel: "optionLabel",
	price: "price",
	compareAtPrice: "compareAtPrice",
	gtin: "gtin",
	reorderPoint: "reorderPoint",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

export function VariantDialog({
	product,
	size,
	onClose,
}: {
	product: AdminProduct;
	size?: Size;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterProductChange();
	const moneyInput = useMoneyInput();
	// An active variant of a published product always has a price.
	const rules = {
		parseAmount: moneyInput.parse,
		priceRequired:
			product.status === "published" && (size?.status ?? "active") === "active",
	};
	const schema = z
		.object({
			sku: z.string(),
			optionLabel: z.string(),
			price: z.string(),
			compareAtPrice: z.string(),
			gtin: z.string(),
			reorderPoint: z.string(),
		})
		.superRefine((value, ctx) => {
			for (const issue of variantIssues(value, rules))
				ctx.addIssue({
					code: "custom",
					path: [issue.field],
					message: issue.message,
				});
		});

	const save = useMutation({
		mutationFn: (value: VariantValues) => {
			const body = variantPayload(value, moneyInput.parse);
			// The SKU goes only when it changed: sending it back as it is would ask to rename it.
			const { sku, ...rest } = body;
			return size
				? parseResponse(
						api().admin.products.variants[":id"].$patch({
							param: { id: String(size.id) },
							json: sku === size.sku ? rest : body,
						}),
					)
				: parseResponse(
						api().admin.products[":id"].variants.$post({
							param: { id: String(product.id) },
							json: body,
						}),
					);
		},
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: size
			? variantValues(size, moneyInput.toInput)
			: emptyVariant,
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

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-xl"
			title={
				size
					? m.admin_product_size_edit_title({ sku: size.sku })
					: m.admin_product_size_add()
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
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="sm:col-span-2">
							<form.AppField name="sku">
								{(field) => (
									<field.TextField
										label={m.admin_product_sku()}
										maxLength={PRODUCT_LIMITS.sku}
										placeholder="TEC-001"
										disabled={size !== undefined && !size.skuEditable}
									/>
								)}
							</form.AppField>
							{size !== undefined && !size.skuEditable && (
								<p className="type-meta mt-1.5 text-muted-foreground">
									{m.admin_product_sku_locked()}
								</p>
							)}
						</div>
						<div className="sm:col-span-2">
							<form.AppField name="optionLabel">
								{(field) => (
									<field.TextField
										label={m.admin_product_option_label()}
										placeholder={m.admin_product_option_placeholder()}
										maxLength={PRODUCT_LIMITS.optionLabel}
									/>
								)}
							</form.AppField>
						</div>
						<form.AppField name="price">
							{(field) => <field.MoneyField label={m.admin_price_label()} />}
						</form.AppField>
						<form.AppField name="compareAtPrice">
							{(field) => (
								<field.MoneyField label={m.admin_product_compare_at()} />
							)}
						</form.AppField>
						<form.AppField name="gtin">
							{(field) => (
								<field.TextField
									label={m.admin_product_gtin()}
									inputMode="numeric"
								/>
							)}
						</form.AppField>
						<form.AppField name="reorderPoint">
							{(field) => (
								<field.TextField
									label={m.admin_product_reorder_point()}
									inputMode="numeric"
								/>
							)}
						</form.AppField>
					</div>
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
