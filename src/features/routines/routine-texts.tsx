import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Section } from "#/components/admin/section";
import { api, parseResponse } from "#/lib/api";
import type { Locale } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { useRefresh } from "../merchandising/status-change";
import {
	changedTexts,
	invalidLocales,
	languagesInUse,
	requireInEachLanguage,
	touchInvalidFields,
} from "../merchandising/translations";
import { type RoutineDetail, routinesKeys } from "./queries";

const FIELDS = [
	"translations.es.title",
	"translations.es.description",
	"translations.es.seoTitle",
	"translations.es.seoDescription",
	"translations.en.title",
	"translations.en.description",
	"translations.en.seoTitle",
	"translations.en.seoDescription",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const texts = z.object({
	title: z.string().trim().max(120),
	description: z.string().trim().max(1000),
	seoTitle: z.string().trim().max(70),
	seoDescription: z.string().trim().max(160),
});

export function RoutineTexts({
	routine,
	defaultLocale,
	onSaved,
}: {
	routine: RoutineDetail;
	defaultLocale: Locale;
	// The title is in the page's breadcrumb.
	onSaved: () => Promise<unknown>;
}) {
	const refresh = useRefresh(routinesKeys.all);
	const stored = routine.translations.map((t) => t.locale);
	const textsOf = (locale: Locale) => {
		const row = routine.translations.find((t) => t.locale === locale);
		return {
			title: row?.title ?? "",
			description: row?.description ?? "",
			seoTitle: row?.seoTitle ?? "",
			seoDescription: row?.seoDescription ?? "",
		};
	};
	const initial = { translations: { es: textsOf("es"), en: textsOf("en") } };

	const schema = z
		.object({ translations: z.object({ es: texts, en: texts }) })
		.superRefine((value, ctx) =>
			requireInEachLanguage(
				ctx,
				value.translations,
				languagesInUse(value.translations, stored, defaultLocale),
				"title",
			),
		);

	const save = useMutation({
		mutationFn: async (value: z.output<typeof schema>) => {
			const changed = changedTexts(
				value.translations,
				initial.translations,
				languagesInUse(value.translations, stored, defaultLocale),
			);
			for (const [locale, text] of changed)
				await parseResponse(
					api().admin.routines[":id"].translations[":locale"].$put({
						param: { id: String(routine.id), locale },
						json: text,
					}),
				);
		},
		onSuccess: async () => {
			await refresh();
			await onSaved();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: initial,
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
		onSubmitInvalid: ({ formApi }) => touchInvalidFields(formApi),
	});

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
					title={m.admin_routine_texts()}
					action={
						<form.Subscribe selector={(state) => state.isDefaultValue}>
							{(unchanged) => (
								<form.SubmitButton
									size="sm"
									variant="outline"
									disabled={unchanged}
								>
									{m.admin_save()}
								</form.SubmitButton>
							)}
						</form.Subscribe>
					}
				>
					<div className="grid gap-3 p-admin-card">
						<form.Subscribe
							selector={(state) => invalidLocales(state.fieldMeta)}
						>
							{(invalid) => (
								<LocaleTabs defaultLocale={defaultLocale} invalid={invalid}>
									{(locale) => (
										<>
											<form.AppField name={`translations.${locale}.title`}>
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
						<form.FormError />
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
