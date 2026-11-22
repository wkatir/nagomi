import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Section } from "#/components/admin/section";
import { Button } from "#/components/ui/button";
import { useMoneyInput } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { SLUG_REGEX } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { slugify } from "../merchandising/slug";
import { useRefresh } from "../merchandising/status-change";
import {
	changedTexts,
	invalidLocales,
	languagesInUse,
	requireInEachLanguage,
	touchInvalidFields,
} from "../merchandising/translations";
import { bundlesKeys } from "./queries";

const FIELDS = [
	"slug",
	"position",
	"isFeatured",
	"price",
	"translations.es.name",
	"translations.es.description",
	"translations.es.seoTitle",
	"translations.es.seoDescription",
	"translations.en.name",
	"translations.en.description",
	"translations.en.seoTitle",
	"translations.en.seoDescription",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const texts = z.object({
	name: z.string().trim().max(120),
	description: z.string().trim().max(1000),
	seoTitle: z.string().trim().max(70),
	seoDescription: z.string().trim().max(160),
});
const blank = { name: "", description: "", seoTitle: "", seoDescription: "" };

export function NewBundleForm() {
	const navigate = useNavigate();
	const refresh = useRefresh(bundlesKeys.all);
	const { data: settings } = useSuspenseQuery(storeQuery);
	const { defaultLocale } = settings;
	const moneyInput = useMoneyInput();

	const schema = z
		.object({
			slug: z
				.string()
				.trim()
				.max(80)
				.regex(SLUG_REGEX, m.admin_merch_slug_invalid()),
			position: z
				.string()
				.trim()
				.regex(/^(?:0|[1-9]\d{0,2}|1000)$/, m.admin_merch_position_invalid()),
			isFeatured: z.boolean(),
			price: z.string(),
			translations: z.object({ es: texts, en: texts }),
		})
		.superRefine((value, ctx) => {
			requireInEachLanguage(
				ctx,
				value.translations,
				languagesInUse(value.translations, [], defaultLocale),
				"name",
			);
			const amount = moneyInput.parse(value.price);
			if (amount === null || amount < 1)
				ctx.addIssue({
					code: "custom",
					path: ["price"],
					message: m.admin_invalid_amount(),
				});
		});

	const create = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.bundles.$post({
					json: {
						slug: value.slug,
						price: moneyInput.parse(value.price) as number,
						position: Number(value.position),
						isFeatured: value.isFeatured,
						translations: Object.fromEntries(
							changedTexts(
								value.translations,
								{ es: blank, en: blank },
								languagesInUse(value.translations, [], defaultLocale),
							),
						),
					},
				}),
			),
		onSuccess: async (bundle) => {
			await refresh();
			await navigate({
				to: "/admin/bundles/$id",
				params: { id: bundle.id },
			});
		},
	});

	const form = useAppForm({
		defaultValues: {
			slug: "",
			position: "0",
			isFeatured: false,
			price: "",
			translations: { es: blank, en: blank },
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
		onSubmitInvalid: ({ formApi }) => touchInvalidFields(formApi),
	});

	return (
		<form
			noValidate
			className="mx-auto w-full max-w-3xl"
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<Section title={m.admin_bundle_new()}>
					<div className="grid gap-4 p-admin-card">
						<form.Subscribe
							selector={(state) => invalidLocales(state.fieldMeta)}
						>
							{(invalid) => (
								<LocaleTabs defaultLocale={defaultLocale} invalid={invalid}>
									{(locale) => (
										<>
											<form.AppField
												name={`translations.${locale}.name`}
												listeners={{
													onChange: ({ value }) => {
														if (
															locale === defaultLocale &&
															!form.getFieldMeta("slug")?.isDirty
														)
															form.setFieldValue("slug", slugify(value), {
																dontUpdateMeta: true,
															});
													},
												}}
											>
												{(field) => (
													<field.TextField
														label={m.admin_field_name()}
														maxLength={120}
													/>
												)}
											</form.AppField>
											<form.AppField
												name={`translations.${locale}.description`}
											>
												{(field) => (
													<field.TextareaField
														label={m.admin_field_description()}
														maxLength={1000}
													/>
												)}
											</form.AppField>
											<form.AppField name={`translations.${locale}.seoTitle`}>
												{(field) => (
													<field.TextField
														label={m.admin_merch_seo_title()}
														maxLength={70}
													/>
												)}
											</form.AppField>
											<form.AppField
												name={`translations.${locale}.seoDescription`}
											>
												{(field) => (
													<field.TextareaField
														label={m.admin_merch_seo_description()}
														maxLength={160}
													/>
												)}
											</form.AppField>
										</>
									)}
								</LocaleTabs>
							)}
						</form.Subscribe>
						<div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
							<form.AppField name="slug">
								{(field) => (
									<field.TextField
										label={m.admin_merch_slug()}
										maxLength={80}
									/>
								)}
							</form.AppField>
							<form.AppField name="position">
								{(field) => (
									<field.TextField
										label={m.admin_bundle_position()}
										inputMode="numeric"
										maxLength={4}
									/>
								)}
							</form.AppField>
						</div>
						<form.AppField name="price">
							{(field) => <field.MoneyField label={m.admin_bundle_price()} />}
						</form.AppField>
						<p className="type-meta text-muted-foreground">
							{m.admin_bundle_price_help()}
						</p>
						<form.AppField name="isFeatured">
							{(field) => (
								<field.CheckboxField label={m.admin_bundle_featured()} />
							)}
						</form.AppField>
						<form.FormError />
						<div className="flex justify-end gap-2">
							<Button variant="outline" asChild>
								<Link to="/admin/bundles">{m.admin_cancel()}</Link>
							</Button>
							<form.SubmitButton>{m.admin_bundle_create()}</form.SubmitButton>
						</div>
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
