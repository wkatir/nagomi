import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useRef } from "react";
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
import { type Locale, SLUG_REGEX } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { slugify } from "../merchandising/slug";
import { useRefresh } from "../merchandising/status-change";
import {
	changedTexts,
	invalidLocales,
	languagesInUse,
	touchInvalidFields,
} from "../merchandising/translations";
import { type BrandDetail, brandQuery, brandsKeys } from "./queries";

const FIELDS = [
	"name",
	"slug",
	"countryCode",
	"translations.es.description",
	"translations.es.seoTitle",
	"translations.es.seoDescription",
	"translations.en.description",
	"translations.en.seoTitle",
	"translations.en.seoDescription",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const texts = z.object({
	description: z.string().trim().max(2000),
	seoTitle: z.string().trim().max(70),
	seoDescription: z.string().trim().max(160),
});

export function BrandDialog({
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
			title={m.admin_brand_new()}
		>
			<BrandForm onClose={onClose} />
		</AdminDialog>
	) : (
		<EditBrandDialog id={id} onClose={onClose} />
	);
}

function EditBrandDialog({ id, onClose }: { id: number; onClose: () => void }) {
	const query = useQuery(brandQuery(id));
	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-xl"
			title={m.admin_brand_edit()}
		>
			<QueryState query={query}>
				{(brand) => <BrandForm brand={brand} onClose={onClose} />}
			</QueryState>
		</AdminDialog>
	);
}

export function BrandForm({
	brand,
	onClose,
}: {
	brand?: BrandDetail;
	onClose: () => void;
}) {
	const refresh = useRefresh(brandsKeys.all);
	const { data: settings } = useSuspenseQuery(storeQuery);
	const { defaultLocale } = settings;
	const stored = brand ? brand.translations.map((t) => t.locale) : [];
	// Set when a first submit created the brand but its texts failed, so the retry does not
	// create it again.
	const created = useRef<number | null>(null);

	const textsOf = (locale: Locale) => {
		const row = brand?.translations.find((t) => t.locale === locale);
		return {
			description: row?.description ?? "",
			seoTitle: row?.seoTitle ?? "",
			seoDescription: row?.seoDescription ?? "",
		};
	};
	const initial = {
		name: brand?.name ?? "",
		slug: brand?.slug ?? "",
		countryCode: brand?.countryCode ?? "",
		translations: { es: textsOf("es"), en: textsOf("en") },
	};

	const schema = z.object({
		name: z.string().trim().min(1, m.admin_required()).max(80),
		slug: z
			.string()
			.trim()
			.max(80)
			.regex(SLUG_REGEX, m.admin_merch_slug_invalid()),
		countryCode: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^(?:[A-Z]{2})?$/, m.admin_brand_country_invalid()),
		translations: z.object({ es: texts, en: texts }),
	});

	const save = useMutation({
		mutationFn: async (value: z.output<typeof schema>) => {
			const countryCode = value.countryCode === "" ? null : value.countryCode;
			let id = brand?.id ?? created.current;
			if (id === null) {
				const newBrand = await parseResponse(
					api().admin.brands.$post({
						json: { name: value.name, slug: value.slug, countryCode },
					}),
				);
				created.current = newBrand.id;
				id = newBrand.id;
			} else if (brand) {
				const fields = {
					...(value.name === brand.name ? {} : { name: value.name }),
					...(value.slug === brand.slug ? {} : { slug: value.slug }),
					...(countryCode === brand.countryCode ? {} : { countryCode }),
				};
				if (Object.keys(fields).length > 0)
					await parseResponse(
						api().admin.brands[":id"].$patch({
							param: { id: String(id) },
							json: fields,
						}),
					);
			}
			const changed = changedTexts(
				value.translations,
				initial.translations,
				languagesInUse(value.translations, stored, defaultLocale),
			);
			for (const [locale, text] of changed)
				await parseResponse(
					api().admin.brands[":id"].translations[":locale"].$put({
						param: { id: String(id), locale },
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
					<div className="grid gap-3 sm:grid-cols-2">
						<form.AppField
							name="name"
							listeners={{
								onChange: ({ value }) => {
									if (!brand && !form.getFieldMeta("slug")?.isDirty)
										form.setFieldValue("slug", slugify(value), {
											dontUpdateMeta: true,
										});
								},
							}}
						>
							{(field) => (
								<field.TextField label={m.admin_field_name()} maxLength={80} />
							)}
						</form.AppField>
						<form.AppField name="slug">
							{(field) => (
								<field.TextField label={m.admin_merch_slug()} maxLength={80} />
							)}
						</form.AppField>
						<form.AppField name="countryCode">
							{(field) => (
								<field.TextField
									label={m.admin_brand_country()}
									maxLength={2}
									autoCapitalize="characters"
								/>
							)}
						</form.AppField>
					</div>
					<form.Subscribe selector={(state) => invalidLocales(state.fieldMeta)}>
						{(invalid) => (
							<LocaleTabs defaultLocale={defaultLocale} invalid={invalid}>
								{(locale) => (
									<>
										<form.AppField name={`translations.${locale}.description`}>
											{(field) => (
												<field.TextareaField
													label={m.admin_field_description()}
													maxLength={2000}
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
