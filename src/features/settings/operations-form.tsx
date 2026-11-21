import { z } from "zod";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import type { AdminSettings } from "#/lib/api";
import { canonicalTimeZone, isCountryCode } from "#/lib/intl";
import { m } from "#/paraglide/messages";
import { Hint } from "./hint";
import { useSaveSettings } from "./mutations";
import { numberText, optionalWholeNumber, wholeNumber } from "./numbers";
import { settingsErrors } from "./server-errors";

const FIELDS = [
	"timeZone",
	"countryCode",
	"orderCodePrefix",
	"maxQuantityPerLine",
	"expiryWarningDays",
	"minShelfLifeDays",
	"returnWindowDays",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);
const CODE_FIELDS = {
	promise_requires_return_window: "returnWindowDays",
} as const;

function OperationsForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();

	const schema = z.object({
		timeZone: z
			.string()
			.trim()
			.refine(
				(value) => canonicalTimeZone(value) !== null,
				m.admin_settings_time_zone_invalid(),
			),
		countryCode: z
			.string()
			.trim()
			.toUpperCase()
			.refine(isCountryCode, m.admin_settings_country_invalid()),
		orderCodePrefix: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z0-9]{1,8}$/, m.admin_settings_prefix_invalid()),
		maxQuantityPerLine: wholeNumber(1, 999),
		expiryWarningDays: wholeNumber(1, 3650),
		minShelfLifeDays: optionalWholeNumber(1, 3650),
		returnWindowDays: optionalWholeNumber(1, 365),
	});

	const form = useAppForm({
		defaultValues: {
			timeZone: settings.timeZone ?? "",
			countryCode: settings.countryCode ?? "",
			orderCodePrefix: settings.orderCodePrefix ?? "",
			maxQuantityPerLine: numberText(settings.maxQuantityPerLine),
			expiryWarningDays: numberText(settings.expiryWarningDays),
			minShelfLifeDays: numberText(settings.minShelfLifeDays),
			returnWindowDays: numberText(settings.returnWindowDays),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return settingsErrors(error, fieldOf, CODE_FIELDS);
				}
			},
		},
	});

	return (
		<form.AppForm>
			<FormCard
				title={m.admin_settings_operations()}
				description={m.admin_settings_operations_help()}
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
				<div className="grid items-start gap-4 sm:grid-cols-2">
					<form.AppField name="timeZone">
						{(field) => (
							<field.TextField
								label={m.admin_field_time_zone()}
								placeholder="America/El_Salvador"
								autoComplete="off"
							/>
						)}
					</form.AppField>
					<form.AppField name="countryCode">
						{(field) => (
							<field.TextField
								label={m.admin_field_country()}
								maxLength={2}
								placeholder="SV"
								autoComplete="off"
							/>
						)}
					</form.AppField>
					<form.AppField name="orderCodePrefix">
						{(field) => (
							<field.TextField
								label={m.admin_field_order_code_prefix()}
								maxLength={8}
								placeholder="EC"
								autoComplete="off"
							/>
						)}
					</form.AppField>
					<form.AppField name="maxQuantityPerLine">
						{(field) => (
							<field.TextField
								label={m.admin_field_max_quantity()}
								inputMode="numeric"
							/>
						)}
					</form.AppField>
					<form.AppField name="expiryWarningDays">
						{(field) => (
							<field.TextField
								label={m.admin_field_expiry_warning()}
								inputMode="numeric"
							/>
						)}
					</form.AppField>
					<form.AppField name="minShelfLifeDays">
						{(field) => (
							<field.TextField
								label={m.admin_field_min_shelf_life()}
								inputMode="numeric"
							/>
						)}
					</form.AppField>
					<div className="grid gap-1.5">
						<form.AppField name="returnWindowDays">
							{(field) => (
								<field.TextField
									label={m.admin_field_return_window()}
									inputMode="numeric"
								/>
							)}
						</form.AppField>
						<Hint>{m.admin_settings_return_window_help()}</Hint>
					</div>
				</div>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

// Keyed by what is stored, so a save remounts the form clean.
export function OperationsCard({ settings }: { settings: AdminSettings }) {
	const stored = [
		settings.timeZone,
		settings.countryCode,
		settings.orderCodePrefix,
		settings.maxQuantityPerLine,
		settings.expiryWarningDays,
		settings.minShelfLifeDays,
		settings.returnWindowDays,
	];
	return <OperationsForm key={JSON.stringify(stored)} settings={settings} />;
}
