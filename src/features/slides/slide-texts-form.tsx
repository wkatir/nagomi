import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import { api, parseResponse } from "#/lib/api";
import { LOCALES } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { useRefreshSlides } from "./mutations";
import type { Slide } from "./queries";
import {
	changedTexts,
	initialTexts,
	localesWithErrors,
	type SlideTexts,
	slideTextsSchema,
	TEXT_FIELDS,
} from "./texts";

const FIELDS = LOCALES.flatMap((locale) =>
	TEXT_FIELDS.map((field) => `translations.${locale}.${field}` as const),
);
const fieldOf = (path: string) => FIELDS.find((name) => name === path);

function TextsForm({ slide }: { slide: Slide }) {
	const refresh = useRefreshSlides();
	const { data: store } = useSuspenseQuery(storeQuery);
	const initial = initialTexts(slide.translations);
	const schema = slideTextsSchema({
		defaultLocale: store.defaultLocale,
		stored: slide.translations.map((text) => text.locale),
	});

	const save = useMutation({
		mutationFn: (translations: Partial<SlideTexts>) =>
			parseResponse(
				api().admin["home-slides"][":id"].translations.$put({
					param: { id: String(slide.id) },
					json: { translations },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: { translations: initial },
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				const changed = changedTexts(schema.parse(value).translations, initial);
				if (Object.keys(changed).length === 0) return null;
				try {
					await save.mutateAsync(changed);
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});

	return (
		<form.AppForm>
			<FormCard
				title={m.admin_slide_texts()}
				description={m.admin_slide_texts_help()}
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
				footer={
					<form.Subscribe selector={(state) => state.isDefaultValue}>
						{(unchanged) => (
							<form.SubmitButton disabled={unchanged}>
								{m.admin_save()}
							</form.SubmitButton>
						)}
					</form.Subscribe>
				}
			>
				<form.Subscribe selector={(state) => state.fieldMeta}>
					{(fieldMeta) => (
						<LocaleTabs
							defaultLocale={store.defaultLocale}
							invalid={localesWithErrors(fieldMeta)}
						>
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
									<form.AppField name={`translations.${locale}.body`}>
										{(field) => (
											<field.TextareaField
												label={m.admin_slide_body()}
												rows={3}
												maxLength={300}
											/>
										)}
									</form.AppField>
									<form.AppField name={`translations.${locale}.ctaLabel`}>
										{(field) => (
											<field.TextField
												label={m.admin_slide_cta()}
												maxLength={40}
											/>
										)}
									</form.AppField>
									<form.AppField name={`translations.${locale}.imageAlt`}>
										{(field) => (
											<field.TextField
												label={m.admin_slide_image_alt()}
												maxLength={250}
											/>
										)}
									</form.AppField>
								</>
							)}
						</LocaleTabs>
					)}
				</form.Subscribe>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

// Keyed by the stored texts, so a save remounts the form clean.
export function SlideTextsForm({ slide }: { slide: Slide }) {
	return <TextsForm key={JSON.stringify(slide.translations)} slide={slide} />;
}
