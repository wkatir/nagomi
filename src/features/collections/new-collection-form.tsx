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
import { collectionsKeys } from "./queries";

const FIELDS = [
	"slug",
	"position",
	"showOnHome",
	"coverMediaId",
	"translations.es.title",
	"translations.es.description",
	"translations.es.coverAlt",
	"translations.es.seoTitle",
	"translations.es.seoDescription",
	"translations.en.title",
	"translations.en.description",
	"translations.en.coverAlt",
	"translations.en.seoTitle",
	"translations.en.seoDescription",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const texts = z.object({
	title: z.string().trim().max(120),
	description: z.string().trim().max(2000),
	coverAlt: z.string().trim().max(250),
	seoTitle: z.string().trim().max(70),
	seoDescription: z.string().trim().max(160),
});
const blank = {
	title: "",
	description: "",
	coverAlt: "",
	seoTitle: "",
	seoDescription: "",
};

// Made as a draft with no products; they are added on its page, which opens next.
export function NewCollectionForm() {
	const navigate = useNavigate();
	const refresh = useRefresh(collectionsKeys.all);
	const { data: settings } = useSuspenseQuery(storeQuery);
	const { defaultLocale } = settings;

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
			showOnHome: z.boolean(),
			coverMediaId: z.number().nullable(),
			translations: z.object({ es: texts, en: texts }),
		})
		.superRefine((value, ctx) =>
			requireInEachLanguage(
				ctx,
				value.translations,
				languagesInUse(value.translations, [], defaultLocale),
				"title",
			),
		);

	const create = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.collections.$post({
					json: {
						slug: value.slug,
						position: Number(value.position),
						showOnHome: value.showOnHome,
						coverMediaId: value.coverMediaId,
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
		onSuccess: async (collection) => {
			await refresh();
			await navigate({
				to: "/admin/collections/$id",
				params: { id: collection.id },
			});
		},
	});

	const form = useAppForm({
		defaultValues: {
			slug: "",
			position: "0",
			showOnHome: false,
			coverMediaId: null as number | null,
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
				<Section title={m.admin_collection_new()}>
					<div className="grid gap-4 p-admin-card">
						<form.Subscribe
							selector={(state) => invalidLocales(state.fieldMeta)}
						>
							{(invalid) => (
								<LocaleTabs defaultLocale={defaultLocale} invalid={invalid}>
									{(locale) => (
										<>
											<form.AppField
												name={`translations.${locale}.title`}
												listeners={{
													onChange: ({ value }) => {
														// The address follows the title until the user writes one.
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
														label={m.admin_field_title()}
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
														maxLength={2000}
													/>
												)}
											</form.AppField>
											<form.AppField name={`translations.${locale}.coverAlt`}>
												{(field) => (
													<field.TextField
														label={m.admin_collection_cover_alt()}
														maxLength={250}
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
						<form.AppField name="coverMediaId">
							{(field) => (
								<field.MediaField label={m.admin_collection_cover()} />
							)}
						</form.AppField>
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
										label={m.admin_collection_position()}
										inputMode="numeric"
										maxLength={4}
									/>
								)}
							</form.AppField>
						</div>
						<form.AppField name="showOnHome">
							{(field) => (
								<field.CheckboxField
									label={m.admin_collection_show_on_home()}
								/>
							)}
						</form.AppField>
						<form.FormError />
						<div className="flex justify-end gap-2">
							<Button variant="outline" asChild>
								<Link to="/admin/collections">{m.admin_cancel()}</Link>
							</Button>
							<form.SubmitButton>
								{m.admin_collection_create()}
							</form.SubmitButton>
						</div>
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
