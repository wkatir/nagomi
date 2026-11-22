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
import { WritableFor } from "#/components/admin/staff-access";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import { CATEGORY_ICONS, type Locale, SLUG_REGEX } from "#/lib/enums";
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
import { categoryIcon, categoryIconLabel, isCategoryIcon } from "./icons";
import { type CategoryDetail, categoriesKeys, categoryQuery } from "./queries";

const FIELDS = [
	"slug",
	"sortOrder",
	"icon",
	"translations.es.name",
	"translations.es.subtitle",
	"translations.es.description",
	"translations.es.seoTitle",
	"translations.es.seoDescription",
	"translations.en.name",
	"translations.en.subtitle",
	"translations.en.description",
	"translations.en.seoTitle",
	"translations.en.seoDescription",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const texts = z.object({
	name: z.string().trim().max(80),
	subtitle: z.string().trim().max(80),
	description: z.string().trim().max(1000),
	seoTitle: z.string().trim().max(70),
	seoDescription: z.string().trim().max(160),
});

export function CategoryDialog({
	id,
	onClose,
}: {
	id?: number;
	onClose: () => void;
}) {
	return id === undefined ? (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-xl"
			title={m.admin_category_new()}
		>
			<CategoryForm onClose={onClose} />
		</AdminDialog>
	) : (
		<EditCategoryDialog id={id} onClose={onClose} />
	);
}

function EditCategoryDialog({
	id,
	onClose,
}: {
	id: number;
	onClose: () => void;
}) {
	const query = useQuery(categoryQuery(id));
	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-xl"
			title={m.admin_category_edit()}
		>
			<QueryState query={query}>
				{(category) => <CategoryForm category={category} onClose={onClose} />}
			</QueryState>
		</AdminDialog>
	);
}

export function CategoryForm({
	category,
	onClose,
}: {
	category?: CategoryDetail;
	onClose: () => void;
}) {
	const refresh = useRefresh(categoriesKeys.all);
	const { data: settings } = useSuspenseQuery(storeQuery);
	const { defaultLocale } = settings;
	const stored = category ? category.translations.map((t) => t.locale) : [];

	const textsOf = (locale: Locale) => {
		const row = category?.translations.find((t) => t.locale === locale);
		return {
			name: row?.name ?? "",
			subtitle: row?.subtitle ?? "",
			description: row?.description ?? "",
			seoTitle: row?.seoTitle ?? "",
			seoDescription: row?.seoDescription ?? "",
		};
	};
	const initial = {
		slug: category?.slug ?? "",
		sortOrder: category ? String(category.sortOrder) : "0",
		icon: (category?.icon ?? "") as string,
		translations: { es: textsOf("es"), en: textsOf("en") },
	};

	const schema = z
		.object({
			slug: z
				.string()
				.trim()
				.max(80)
				.regex(SLUG_REGEX, m.admin_merch_slug_invalid()),
			sortOrder: z
				.string()
				.trim()
				.regex(/^(?:0|[1-9]\d{0,2}|1000)$/, m.admin_category_sort_invalid()),
			icon: z.enum(CATEGORY_ICONS, { error: m.admin_required() }),
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
			const sortOrder = Number(value.sortOrder);
			if (!category)
				return parseResponse(
					api().admin.categories.$post({
						json: {
							slug: value.slug,
							sortOrder,
							icon: value.icon,
							translations: Object.fromEntries(changed),
						},
					}),
				);
			const param = { id: String(category.id) };
			const fields = {
				...(value.slug === category.slug ? {} : { slug: value.slug }),
				...(sortOrder === category.sortOrder ? {} : { sortOrder }),
				...(value.icon === category.icon ? {} : { icon: value.icon }),
			};
			if (Object.keys(fields).length > 0)
				await parseResponse(
					api().admin.categories[":id"].$patch({ param, json: fields }),
				);
			for (const [locale, text] of changed)
				await parseResponse(
					api().admin.categories[":id"].translations[":locale"].$put({
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
			<WritableFor area="catalog">
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
													if (
														locale === defaultLocale &&
														!category &&
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
										<form.AppField name={`translations.${locale}.subtitle`}>
											{(field) => (
												<field.TextField
													label={m.admin_category_subtitle()}
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
					<div className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
						<form.AppField name="slug">
							{(field) => (
								<field.TextField label={m.admin_merch_slug()} maxLength={80} />
							)}
						</form.AppField>
						<form.AppField name="sortOrder">
							{(field) => (
								<field.TextField
									label={m.admin_category_sort_order()}
									inputMode="numeric"
									maxLength={4}
								/>
							)}
						</form.AppField>
						<form.AppField name="icon">
							{(field) => (
								<field.SelectField
									label={m.admin_category_icon()}
									options={[
										{ value: "", label: m.admin_category_icon_none() },
										...CATEGORY_ICONS.map((icon) => ({
											value: icon,
											label: categoryIconLabel[icon](),
										})),
									]}
								/>
							)}
						</form.AppField>
					</div>
					<form.Subscribe selector={(state) => state.values.icon}>
						{(icon) => {
							if (!isCategoryIcon(icon)) return null;
							const Icon = categoryIcon[icon];
							return (
								<p className="type-meta flex items-center gap-2 text-muted-foreground">
									<Icon aria-hidden className="size-5" />
									{categoryIconLabel[icon]()}
								</p>
							);
						}}
					</form.Subscribe>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_save()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</WritableFor>
		</form>
	);
}
