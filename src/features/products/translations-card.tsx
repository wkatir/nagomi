import { useStore } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { z } from "zod";
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
import { type AdminProduct, api, parseResponse } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { useRefreshAfterProductChange } from "./mutations";
import { SectionFooter, SectionForm } from "./section-form";
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

const fieldOf = (path: string) =>
	path.startsWith("translations.") ? path : undefined;

// The page remounts the card when this changes (see basicsValues).
export const translationsValues = (product: AdminProduct) =>
	translationValues(product.translations);

export function TranslationsCard({ product }: { product: AdminProduct }) {
	const refresh = useRefreshAfterProductChange();
	const { data: store } = useSuspenseQuery(storeQuery);
	const started = translationsValues(product);
	const schema = translationsSchema({
		defaultLocale: store.defaultLocale,
		stored: product.translations.map((t) => t.locale),
	});

	const save = useMutation({
		mutationFn: async (value: z.output<typeof schema>) => {
			const translations = translationsPayload(value.translations, started);
			// Spaces added or removed change no text: there is nothing to write.
			if (Object.keys(translations).length === 0) return;
			await parseResponse(
				api().admin.products[":id"].translations.$put({
					param: { id: String(product.id) },
					json: { translations },
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: { translations: started },
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
		localesWithErrors(state.fieldMeta, "translations"),
	);

	return (
		<SectionForm onSubmit={() => form.handleSubmit()}>
			<form.AppForm>
				<Section title={m.admin_product_texts()}>
					<div className="p-admin-card">
						<LocaleTabs defaultLocale={store.defaultLocale} invalid={invalid}>
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
					<SectionFooter />
				</Section>
			</form.AppForm>
		</SectionForm>
	);
}
