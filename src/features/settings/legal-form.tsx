import { z } from "zod";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import type { AdminSettings } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { useSaveSettings } from "./mutations";
import { numberText, optionalWholeNumber } from "./numbers";
import { settingsErrors } from "./server-errors";

const FIELDS = [
	"legalName",
	"taxIdLabel",
	"taxId",
	"address",
	"phone",
	"email",
	"foundingYear",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const orNull = (value: string) => value || null;

function LegalForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();

	const schema = z
		.object({
			legalName: z.string().trim().max(120),
			taxIdLabel: z.string().trim().max(20),
			taxId: z.string().trim().max(40),
			address: z.string().trim().max(240),
			phone: z.string().trim().max(30),
			email: z
				.string()
				.trim()
				.refine(
					(value) => value === "" || z.email().safeParse(value).success,
					m.admin_settings_email_invalid(),
				),
			foundingYear: optionalWholeNumber(1900, new Date().getFullYear()),
		})
		.superRefine((value, ctx) => {
			if (value.taxId !== "" && value.taxIdLabel === "")
				ctx.addIssue({
					code: "custom",
					path: ["taxIdLabel"],
					message: m.admin_settings_tax_label_required(),
				});
		});

	const form = useAppForm({
		defaultValues: {
			legalName: settings.legalName ?? "",
			taxIdLabel: settings.taxIdLabel ?? "",
			taxId: settings.taxId ?? "",
			address: settings.address ?? "",
			phone: settings.phone ?? "",
			email: settings.email ?? "",
			foundingYear: numberText(settings.foundingYear),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				const text = schema.parse(value);
				try {
					await save.mutateAsync({
						legalName: orNull(text.legalName),
						taxIdLabel: orNull(text.taxIdLabel),
						taxId: orNull(text.taxId),
						address: orNull(text.address),
						phone: orNull(text.phone),
						email: orNull(text.email),
						foundingYear: text.foundingYear,
					});
					return null;
				} catch (error) {
					return settingsErrors(error, fieldOf, {});
				}
			},
		},
	});

	return (
		<form.AppForm>
			<FormCard
				title={m.admin_settings_business()}
				description={m.admin_settings_business_help()}
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
				footer={<form.SaveButton>{m.admin_save()}</form.SaveButton>}
			>
				<div className="grid items-start gap-4 sm:grid-cols-2">
					<form.AppField name="legalName">
						{(field) => (
							<field.TextField
								label={m.admin_field_legal_name()}
								maxLength={120}
							/>
						)}
					</form.AppField>
					<form.AppField name="address">
						{(field) => (
							<field.TextField
								label={m.admin_field_address()}
								maxLength={240}
								autoComplete="street-address"
							/>
						)}
					</form.AppField>
					<form.AppField name="taxIdLabel">
						{(field) => (
							<field.TextField
								label={m.admin_field_tax_id_label()}
								maxLength={20}
								placeholder="NIT"
							/>
						)}
					</form.AppField>
					<form.AppField name="taxId">
						{(field) => (
							<field.TextField label={m.admin_field_tax_id()} maxLength={40} />
						)}
					</form.AppField>
					<form.AppField name="phone">
						{(field) => (
							<field.TextField
								label={m.admin_field_phone()}
								inputMode="tel"
								maxLength={30}
							/>
						)}
					</form.AppField>
					<form.AppField name="email">
						{(field) => (
							<field.TextField
								label={m.admin_field_email()}
								type="email"
								autoComplete="email"
							/>
						)}
					</form.AppField>
					<form.AppField name="foundingYear">
						{(field) => (
							<field.TextField
								label={m.admin_field_founding_year()}
								inputMode="numeric"
								maxLength={4}
							/>
						)}
					</form.AppField>
				</div>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

// Keyed by what is stored, so a save remounts the form clean.
export function LegalCard({ settings }: { settings: AdminSettings }) {
	const stored = [
		settings.legalName,
		settings.taxIdLabel,
		settings.taxId,
		settings.address,
		settings.phone,
		settings.email,
		settings.foundingYear,
	];
	return <LegalForm key={JSON.stringify(stored)} settings={settings} />;
}
