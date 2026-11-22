import { useStore } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { Field } from "#/components/admin/field";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { imageKindLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { type AdminProduct, api, parseResponse } from "#/lib/api";
import { IMAGE_KINDS, LOCALES } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { useRefreshAfterProductChange } from "./mutations";
import { altPatch, altSchema, altValues } from "./photo-form";
import { localesWithErrors } from "./translations";

export type Photo = AdminProduct["images"][number];

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif";

const fieldOf = (path: string) =>
	path === "kind" || path === "variantId" || path.startsWith("alt.")
		? path
		: undefined;

// Editing changes the kind, size and descriptions of a photo, never its file.
export function PhotoDialog({
	product,
	photo,
	onClose,
}: {
	product: AdminProduct;
	photo?: Photo;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterProductChange();
	const { data: store } = useSuspenseQuery(storeQuery);
	const fileId = useId();
	const started = altValues(photo?.alt ?? {});
	const schema = altSchema(store.defaultLocale)
		.and(
			z.object({
				file: z.instanceof(File).nullable(),
				kind: z.enum(IMAGE_KINDS),
				variantId: z.string(),
			}),
		)
		.superRefine((value, ctx) => {
			if (!photo && value.file === null)
				ctx.addIssue({
					code: "custom",
					path: ["file"],
					message: m.admin_product_photo_file_required(),
				});
		});

	const save = useMutation({
		mutationFn: async (value: z.output<typeof schema>) => {
			const variantId = value.variantId === "" ? null : Number(value.variantId);
			if (photo) {
				const alt = altPatch(started, value.alt);
				await parseResponse(
					api().admin["product-images"][":id"].$patch({
						param: { id: String(photo.id) },
						json: {
							kind: value.kind,
							variantId,
							...(Object.keys(alt).length > 0 ? { alt } : {}),
						},
					}),
				);
				return;
			}
			if (value.file === null) throw new Error("No photo file was chosen");
			const body = new FormData();
			body.set("file", value.file);
			body.set("productId", String(product.id));
			body.set("kind", value.kind);
			if (variantId !== null) body.set("variantId", String(variantId));
			for (const locale of LOCALES)
				if (value.alt[locale] !== "")
					body.set(`alt.${locale}`, value.alt[locale]);
			const created = await parseResponse(
				api().admin["product-images"].$post(undefined, { init: { body } }),
			);
			// The type also holds the text of the router's early refusals, which parseResponse
			// throws.
			if (typeof created === "string")
				throw new Error(`Unexpected upload answer: ${created}`);
		},
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			file: null as File | null,
			kind: photo?.kind ?? "packshot",
			variantId: photo?.variantId ? String(photo.variantId) : "",
			alt: started,
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
	const invalid = useStore(form.store, (state) =>
		localesWithErrors(state.fieldMeta, "alt"),
	);

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-xl"
			title={photo ? m.admin_product_photo_edit() : m.admin_product_photo_add()}
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
					{!photo && (
						<form.Field name="file">
							{(field) => (
								<Field
									id={fileId}
									label={m.admin_product_photo_file()}
									error={
										field.state.meta.isTouched &&
										field.state.meta.errors.length > 0
											? m.admin_product_photo_file_required()
											: undefined
									}
								>
									<Input
										id={fileId}
										type="file"
										accept={IMAGE_TYPES}
										onBlur={field.handleBlur}
										onChange={(event) =>
											field.handleChange(event.target.files?.[0] ?? null)
										}
									/>
								</Field>
							)}
						</form.Field>
					)}
					<div className="grid gap-3 sm:grid-cols-2">
						<form.AppField name="kind">
							{(field) => (
								<field.SelectField
									label={m.admin_product_photo_kind()}
									options={IMAGE_KINDS.map((kind) => ({
										value: kind,
										label: imageKindLabel[kind](),
									}))}
								/>
							)}
						</form.AppField>
						<form.AppField name="variantId">
							{(field) => (
								<field.SelectField
									label={m.admin_product_photo_size()}
									options={[
										{ value: "", label: m.admin_product_photo_all_sizes() },
										...product.variants
											.filter(
												(size) =>
													size.status === "active" ||
													size.id === photo?.variantId,
											)
											.map((size) => ({
												value: String(size.id),
												label:
													size.optionLabel !== null
														? `${size.optionLabel} · ${size.sku}`
														: size.sku,
											})),
									]}
								/>
							)}
						</form.AppField>
					</div>
					<LocaleTabs defaultLocale={store.defaultLocale} invalid={invalid}>
						{(locale) => (
							<form.AppField name={`alt.${locale}`}>
								{(field) => (
									<field.TextField
										label={m.admin_product_photo_alt()}
										maxLength={PRODUCT_LIMITS.alt}
									/>
								)}
							</form.AppField>
						)}
					</LocaleTabs>
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
