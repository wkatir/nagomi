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
import { SLUG_REGEX } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { choosable } from "./choosable";
import { useRefreshAfterProductChange } from "./mutations";
import { useLoadedProductOptions } from "./options";
import { SectionForm } from "./section-form";
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
import { emptyVariant, variantIssues, variantPayload } from "./variant-form";

// The rest of a variant is set on the product's page.
const SIZE_FIELDS = ["sku", "optionLabel", "price"] as const;

// The API sends the variant as `variant`.
const fieldOf = (path: string) => {
	if (path.startsWith("variant."))
		return `size.${path.slice("variant.".length)}`;
	return path === "slug" ||
		path === "brandId" ||
		path === "categoryId" ||
		path === "warrantyMonths" ||
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
			warrantyMonths: z
				.string()
				.trim()
				.regex(/^\d+$/, m.admin_product_warranty_invalid())
				.refine(
					(value) => Number(value) <= PRODUCT_LIMITS.warrantyMonths,
					m.admin_product_warranty_invalid(),
				),
			size: z.object({
				sku: z.string(),
				optionLabel: z.string(),
				price: z.string(),
			}),
		})
		.and(translationsSchema({ defaultLocale: store.defaultLocale, stored: [] }))
		.superRefine((value, ctx) => {
			// A variant is asked for only once something of it is typed.
			if (SIZE_FIELDS.every((field) => value.size[field].trim() === "")) return;
			const rules = { parseAmount: moneyInput.parse, priceRequired: false };
			for (const issue of variantIssues(
				{ ...emptyVariant, ...value.size },
				rules,
			))
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
						warrantyMonths: Number(value.warrantyMonths),
						translations: translationsPayload(
							value.translations,
							translationValues([]),
						),
						variant: sized
							? variantPayload(
									{ ...emptyVariant, ...value.size },
									moneyInput.parse,
								)
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
			warrantyMonths: "12",
			translations: translationValues([]),
			size: {
				sku: "",
				optionLabel: "",
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
								<form.AppField name="warrantyMonths">
									{(field) => (
										<field.TextField
											label={m.admin_product_warranty_months()}
											inputMode="numeric"
											maxLength={3}
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
												placeholder="TEC-001"
												maxLength={PRODUCT_LIMITS.sku}
											/>
										)}
									</form.AppField>
								</div>
								<form.AppField name="size.optionLabel">
									{(field) => (
										<field.TextField
											label={m.admin_product_option_label()}
											placeholder={m.admin_product_option_placeholder()}
											maxLength={PRODUCT_LIMITS.optionLabel}
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
