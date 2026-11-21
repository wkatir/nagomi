import { z } from "zod";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import { languageName } from "#/components/admin/labels";
import type { AdminSettings } from "#/lib/api";
import { LOCALES } from "#/lib/enums";
import { isCurrencyCode } from "#/lib/intl";
import { m } from "#/paraglide/messages";
import { Hint } from "./hint";
import { useSaveSettings } from "./mutations";
import { settingsErrors } from "./server-errors";

const FIELDS = ["name", "currency", "defaultLocale", "whatsappNumber"] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);
const CODE_FIELDS = {
	currency_locked: "currency",
	default_locale_untranslated: "defaultLocale",
} as const;

function IdentityForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();

	const schema = z.object({
		name: z.string().trim().min(1, m.admin_required()).max(80),
		currency: z
			.string()
			.trim()
			.toUpperCase()
			.refine(isCurrencyCode, m.admin_settings_currency_invalid()),
		defaultLocale: z.enum(LOCALES),
		whatsappNumber: z
			.string()
			.trim()
			.refine(
				(value) => value === "" || /^\d{8,15}$/.test(value),
				m.admin_settings_whatsapp_invalid(),
			),
	});

	const form = useAppForm({
		defaultValues: {
			name: settings.name,
			currency: settings.currency,
			defaultLocale: settings.defaultLocale,
			whatsappNumber: settings.whatsappNumber ?? "",
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				const { whatsappNumber, ...rest } = schema.parse(value);
				try {
					await save.mutateAsync({
						...rest,
						whatsappNumber: whatsappNumber || null,
					});
					return null;
				} catch (error) {
					const refused = settingsErrors(error, fieldOf, CODE_FIELDS);
					// The digits are well formed here, so the API refuses the number itself.
					if (refused.fields.whatsappNumber)
						refused.fields.whatsappNumber = m.admin_settings_whatsapp_invalid();
					return refused;
				}
			},
		},
	});

	return (
		<form.AppForm>
			<FormCard
				title={m.admin_settings_identity()}
				description={m.admin_settings_identity_help()}
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
				<form.AppField name="name">
					{(field) => (
						<field.TextField
							label={m.admin_field_store_name()}
							maxLength={80}
							autoComplete="organization"
						/>
					)}
				</form.AppField>
				<div className="grid items-start gap-4 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<form.AppField name="currency">
							{(field) => (
								<field.TextField
									label={m.admin_field_currency()}
									maxLength={3}
									placeholder="USD"
									autoComplete="off"
								/>
							)}
						</form.AppField>
						<Hint>{m.admin_settings_currency_help()}</Hint>
					</div>
					<div className="grid gap-1.5">
						<form.AppField name="defaultLocale">
							{(field) => (
								<field.SelectField
									label={m.admin_field_default_locale()}
									options={LOCALES.map((locale) => ({
										value: locale,
										label: languageName[locale](),
									}))}
								/>
							)}
						</form.AppField>
						<Hint>{m.admin_settings_locale_help()}</Hint>
					</div>
				</div>
				<div className="grid gap-1.5">
					<form.AppField name="whatsappNumber">
						{(field) => (
							<field.TextField
								label={m.admin_field_whatsapp()}
								inputMode="numeric"
								maxLength={15}
								placeholder="50371234567"
								autoComplete="off"
							/>
						)}
					</form.AppField>
					<Hint>{m.admin_settings_whatsapp_help()}</Hint>
				</div>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

// Keyed by what is stored, so a save remounts the form clean.
export function IdentityCard({ settings }: { settings: AdminSettings }) {
	const stored = [
		settings.name,
		settings.currency,
		settings.defaultLocale,
		settings.whatsappNumber,
	];
	return <IdentityForm key={JSON.stringify(stored)} settings={settings} />;
}
