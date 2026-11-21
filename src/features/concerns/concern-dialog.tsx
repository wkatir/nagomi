import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { QueryState } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import { type Locale, SLUG_REGEX } from "#/lib/enums";
import { adminSettingsQuery } from "#/lib/queries";
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
import { type ConcernDetail, concernQuery, concernsKeys } from "./queries";

const FIELDS = [
	"slug",
	"position",
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
	name: z.string().trim().max(80),
	description: z.string().trim().max(1000),
	seoTitle: z.string().trim().max(70),
	seoDescription: z.string().trim().max(160),
});

export function ConcernDialog({
	id,
	onClose,
}: {
	id?: number;
	onClose: () => void;
}) {
	return id === undefined ? (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-lg"
			title={m.admin_concern_new()}
		>
			<ConcernForm onClose={onClose} />
		</AdminDialog>
	) : (
		<EditConcernDialog id={id} onClose={onClose} />
	);
}

function EditConcernDialog({
	id,
	onClose,
}: {
	id: number;
	onClose: () => void;
}) {
	const query = useQuery(concernQuery(id));
	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-lg"
			title={m.admin_concern_edit()}
		>
			<QueryState query={query}>
				{(concern) => <ConcernForm concern={concern} onClose={onClose} />}
			</QueryState>
		</AdminDialog>
	);
}

export function ConcernForm({
	concern,
	onClose,
}: {
	concern?: ConcernDetail;
	onClose: () => void;
}) {
	const refresh = useRefresh(concernsKeys.all);
	const { data: settings } = useSuspenseQuery(adminSettingsQuery);
	const { defaultLocale } = settings;
	const stored = concern ? concern.translations.map((t) => t.locale) : [];

	const textsOf = (locale: Locale) => {
		const row = concern?.translations.find((t) => t.locale === locale);
		return {
			name: row?.name ?? "",
			description: row?.description ?? "",
			seoTitle: row?.seoTitle ?? "",
			seoDescription: row?.seoDescription ?? "",
		};
	};
	const initial = {
		slug: concern?.slug ?? "",
		position: concern ? String(concern.position) : "0",
		translations: { es: textsOf("es"), en: textsOf("en") },
	};

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
				.regex(/^(?:0|[1-9]\d{0,2}|1000)$/, m.admin_concern_position_invalid()),
			translations: z.object({ es: texts, en: texts }),
		})
		.superRefine((value, ctx) =>
			requireInEachLanguage(
				ctx,
				value.translations,
				languagesInUse(value.translations, stored, defaultLocale),
				"name",
			),
		);

	const save = useMutation({
		mutationFn: async (value: z.output<typeof schema>) => {
			const changed = changedTexts(
				value.translations,
				initial.translations,
				languagesInUse(value.translations, stored, defaultLocale),
			);
			const position = Number(value.position);
			if (!concern)
				return parseResponse(
					api().admin.concerns.$post({
						json: {
							slug: value.slug,
							position,
							translations: Object.fromEntries(changed),
						},
					}),
				);
			// The API takes the need's own fields and each language's text in separate requests.
			const param = { id: String(concern.id) };
			const fields = {
				...(value.slug === concern.slug ? {} : { slug: value.slug }),
				...(position === concern.position ? {} : { position }),
			};
			if (Object.keys(fields).length > 0)
				await parseResponse(
					api().admin.concerns[":id"].$patch({ param, json: fields }),
				);
			for (const [locale, text] of changed)
				await parseResponse(
					api().admin.concerns[":id"].translations[":locale"].$put({
						param: { ...param, locale },
						json: text,
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
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<form.Subscribe selector={(state) => invalidLocales(state.fieldMeta)}>
					{(invalid) => (
						<LocaleTabs defaultLocale={defaultLocale} invalid={invalid}>
							{(locale) => (
								<>
									<form.AppField
										name={`translations.${locale}.name`}
										listeners={{
											onChange: ({ value }) => {
												// A new need's address follows its name until the user writes one.
												if (
													locale === defaultLocale &&
													!concern &&
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
												maxLength={80}
											/>
										)}
									</form.AppField>
									<form.AppField name={`translations.${locale}.description`}>
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
									<form.AppField name={`translations.${locale}.seoDescription`}>
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
				<div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
					<form.AppField name="slug">
						{(field) => (
							<field.TextField label={m.admin_merch_slug()} maxLength={80} />
						)}
					</form.AppField>
					<form.AppField name="position">
						{(field) => (
							<field.TextField
								label={m.admin_concern_position()}
								inputMode="numeric"
								maxLength={4}
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
	);
}
