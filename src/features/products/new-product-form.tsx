import { useStore } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { unitLabel } from "#/components/admin/labels";
import { Section } from "#/components/admin/section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { useMoneyInput } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { SIZE_UNITS, SKIN_TYPES, SLUG_REGEX } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { skinTypeLabel } from "#/lib/skin-type";
import { m } from "#/paraglide/messages";
import { CheckboxGroup } from "./checkbox-group";
import { choosable } from "./choosable";
import { useRefreshAfterProductChange } from "./mutations";
import { useLoadedProductOptions } from "./options";
import { SectionForm } from "./section-form";
import { emptySize, sizeIssues, sizePayload } from "./size-form";
import {
	localesWithErrors,
	MAIN_TEXT_FIELDS,
	SEO_TEXT_FIELDS,
	type TextField,
	textLabel,
	textRows,
	translationsPayload,
	translationsSchema,
	translationValues,
} from "./translations";

// The rest of a size is set on the product's page.
const SIZE_FIELDS = ["sku", "sizeValue", "sizeUnit", "price"] as const;

// The API sends the size as `variant`.
const fieldOf = (path: string) => {
	if (path.startsWith("variant."))
		return `size.${path.slice("variant.".length)}`;
	return path === "slug" ||
		path === "brandId" ||
		path === "categoryId" ||
		path === "concernIds" ||
		path === "skinTypes" ||
		path === "inci" ||
		path === "sanitaryRegistration" ||
		path.startsWith("translations.")
		? path
		: undefined;
};

export function NewProductForm() {
	const navigate = useNavigate();
	const refresh = useRefreshAfterProductChange();
	const moneyInput = useMoneyInput();
	const options = useLoadedProductOptions();
	const { data: store } = useSuspenseQuery(storeQuery);

	const schema = z
		.object({
			slug: z
				.string()
				.trim()
				.min(1, m.admin_required())
				.max(PRODUCT_LIMITS.slug)
				.regex(SLUG_REGEX, m.admin_product_slug_invalid()),
			brandId: z.string().min(1, m.admin_required()),
			categoryId: z.string().min(1, m.admin_required()),
			concernIds: z.array(z.string()),
			skinTypes: z.array(z.enum(SKIN_TYPES)),
			sanitaryRegistration: z
				.string()
				.trim()
				.max(PRODUCT_LIMITS.sanitaryRegistration),
			inci: z.string().trim().max(PRODUCT_LIMITS.inci),
			size: z.object({
				sku: z.string(),
				sizeValue: z.string(),
				sizeUnit: z.union([z.literal(""), z.enum(SIZE_UNITS)]),
				price: z.string(),
			}),
		})
		.and(translationsSchema({ defaultLocale: store.defaultLocale, stored: [] }))
		.superRefine((value, ctx) => {
			// A size is asked for only once something of it is typed.
			if (SIZE_FIELDS.every((field) => value.size[field].trim() === "")) return;
			const rules = { parseAmount: moneyInput.parse, priceRequired: false };
			for (const issue of sizeIssues({ ...emptySize, ...value.size }, rules))
				if (SIZE_FIELDS.some((field) => field === issue.field))
					ctx.addIssue({
						code: "custom",
						path: ["size", issue.field],
						message: issue.message,
					});
		});

	const create = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const sized = SIZE_FIELDS.some(
				(field) => value.size[field].trim() !== "",
			);
			return parseResponse(
				api().admin.products.$post({
					json: {
						slug: value.slug,
						brandId: Number(value.brandId),
						categoryId: Number(value.categoryId),
						concernIds: value.concernIds.map(Number),
						skinTypes: value.skinTypes,
						sanitaryRegistration: value.sanitaryRegistration || null,
						inci: value.inci || null,
						translations: translationsPayload(
							value.translations,
							translationValues([]),
						),
						variant: sized
							? sizePayload({ ...emptySize, ...value.size }, moneyInput.parse)
							: undefined,
					},
				}),
			);
		},
		onSuccess: async (product) => {
			await refresh();
			await navigate({ to: "/admin/products/$id", params: { id: product.id } });
		},
	});

	const form = useAppForm({
		defaultValues: {
			slug: "",
			brandId: "",
			categoryId: "",
			concernIds: [] as string[],
			skinTypes: [] as (typeof SKIN_TYPES)[number][],
			sanitaryRegistration: "",
			inci: "",
			translations: translationValues([]),
			size: {
				sku: "",
				sizeValue: "",
				sizeUnit: "" as "" | (typeof SIZE_UNITS)[number],
				price: "",
			},
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await create.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});
	const invalid = useStore(form.store, (state) =>
		localesWithErrors(state.fieldMeta, "translations"),
	);

	return (
		<SectionForm onSubmit={() => form.handleSubmit()}>
			<form.AppForm>
				<DetailPage>
					<DetailColumns
						aside={
							<>
								<Section title={m.admin_product_organization()}>
									<div className="grid gap-4 p-admin-card">
										<form.AppField name="brandId">
											{(field) => (
												<field.ComboboxField
													label={m.admin_product_col_brand()}
													options={choosable(options.brands, [])}
												/>
											)}
										</form.AppField>
										<form.AppField name="categoryId">
											{(field) => (
												<field.ComboboxField
													label={m.admin_product_col_category()}
													options={choosable(options.categories, [])}
												/>
											)}
										</form.AppField>
										<form.Field name="concernIds">
											{(field) => (
												<CheckboxGroup
													legend={m.admin_product_needs()}
													options={choosable(options.concerns, [])}
													value={field.state.value}
													onChange={field.handleChange}
												/>
											)}
										</form.Field>
										<form.Field name="skinTypes">
											{(field) => (
												<CheckboxGroup
													legend={m.admin_product_skin_types()}
													options={SKIN_TYPES.map((skinType) => ({
														value: skinType,
														label: skinTypeLabel[skinType](),
													}))}
													value={field.state.value}
													onChange={field.handleChange}
												/>
											)}
										</form.Field>
									</div>
								</Section>
								<div className="grid gap-3">
									<form.FormError />
									<div className="flex justify-end gap-2">
										<Button variant="outline" asChild>
											<Link to="/admin/products">{m.admin_cancel()}</Link>
										</Button>
										<form.SubmitButton>
											{m.admin_product_create()}
										</form.SubmitButton>
									</div>
								</div>
							</>
						}
					>
						<Section title={m.admin_product_basics()}>
							<div className="grid gap-3 p-admin-card">
								<form.AppField name="slug">
									{(field) => (
										<field.TextField
											label={m.admin_product_slug()}
											maxLength={PRODUCT_LIMITS.slug}
										/>
									)}
								</form.AppField>
								<form.AppField name="sanitaryRegistration">
									{(field) => (
										<field.TextField
											label={m.admin_field_sanitary_registration()}
											maxLength={PRODUCT_LIMITS.sanitaryRegistration}
										/>
									)}
								</form.AppField>
								<form.AppField name="inci">
									{(field) => (
										<field.TextareaField
											label={m.admin_product_inci()}
											rows={4}
											maxLength={PRODUCT_LIMITS.inci}
										/>
									)}
								</form.AppField>
							</div>
						</Section>
						<Section title={m.admin_product_texts()}>
							<div className="p-admin-card">
								<LocaleTabs
									defaultLocale={store.defaultLocale}
									invalid={invalid}
								>
									{(locale) => {
										const fields = (names: readonly TextField[]) =>
											names.map((name) => (
												<form.AppField
													key={name}
													name={`translations.${locale}.${name}`}
												>
													{(field) =>
														textRows[name] ? (
															<field.TextareaField
																label={textLabel[name]()}
																rows={textRows[name]}
																maxLength={PRODUCT_LIMITS[name]}
															/>
														) : (
															<field.TextField
																label={textLabel[name]()}
																maxLength={PRODUCT_LIMITS[name]}
															/>
														)
													}
												</form.AppField>
											));
										return (
											<>
												{fields(MAIN_TEXT_FIELDS)}
												<Accordion type="single" collapsible>
													<AccordionItem value="seo">
														<AccordionTrigger>
															{m.admin_product_seo()}
														</AccordionTrigger>
														<AccordionContent className="grid gap-3">
															{fields(SEO_TEXT_FIELDS)}
														</AccordionContent>
													</AccordionItem>
												</Accordion>
											</>
										);
									}}
								</LocaleTabs>
							</div>
						</Section>
						<Section title={m.admin_product_first_size()}>
							<div className="grid gap-3 p-admin-card sm:grid-cols-2">
								<div className="sm:col-span-2">
									<p className="type-small mb-3 text-muted-foreground">
										{m.admin_product_first_size_hint()}
									</p>
									<form.AppField name="size.sku">
										{(field) => (
											<field.TextField
												label={m.admin_product_sku()}
												maxLength={PRODUCT_LIMITS.sku}
											/>
										)}
									</form.AppField>
								</div>
								<form.AppField name="size.sizeValue">
									{(field) => (
										<field.TextField
											label={m.admin_size_label()}
											inputMode="numeric"
										/>
									)}
								</form.AppField>
								<form.AppField name="size.sizeUnit">
									{(field) => (
										<field.SelectField
											label={m.admin_unit_label()}
											options={[
												{ value: "", label: m.admin_product_unit_none() },
												...SIZE_UNITS.map((unit) => ({
													value: unit,
													label: unitLabel[unit](),
												})),
											]}
										/>
									)}
								</form.AppField>
								<form.AppField name="size.price">
									{(field) => (
										<field.MoneyField label={m.admin_price_label()} />
									)}
								</form.AppField>
							</div>
						</Section>
					</DetailColumns>
				</DetailPage>
			</form.AppForm>
		</SectionForm>
	);
}
