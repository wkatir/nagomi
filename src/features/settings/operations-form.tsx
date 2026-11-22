import { z } from "zod";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import { useMoneyInput } from "#/hooks/use-money";
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
	"returnWindowDays",
	"freeShippingFrom",
	"lowStockThreshold",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);
const CODE_FIELDS = {
	promise_requires_return_window: "returnWindowDays",
} as const;

function OperationsForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();
	const moneyInput = useMoneyInput();

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
		returnWindowDays: optionalWholeNumber(1, 365),
		freeShippingFrom: z
			.string()
			.trim()
			.refine(
				(text) => text === "" || moneyInput.parse(text) !== null,
				m.admin_invalid_amount(),
			)
			.transform((text) => (text === "" ? null : moneyInput.parse(text))),
		lowStockThreshold: wholeNumber(0, 100_000),
	});

	const form = useAppForm({
		defaultValues: {
			timeZone: settings.timeZone ?? "",
			countryCode: settings.countryCode ?? "",
			orderCodePrefix: settings.orderCodePrefix ?? "",
			maxQuantityPerLine: numberText(settings.maxQuantityPerLine),
			returnWindowDays: numberText(settings.returnWindowDays),
			freeShippingFrom:
				settings.freeShippingFrom === null
					? ""
					: moneyInput.toInput(settings.freeShippingFrom),
			lowStockThreshold: numberText(settings.lowStockThreshold),
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
				footer={<form.SaveButton>{m.admin_save()}</form.SaveButton>}
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
								placeholder="NAG"
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
					<form.AppField name="lowStockThreshold">
						{(field) => (
							<field.TextField
								label={m.admin_field_low_stock_threshold()}
								inputMode="numeric"
							/>
						)}
					</form.AppField>
					<div className="grid gap-1.5">
						<form.AppField name="freeShippingFrom">
							{(field) => (
								<field.MoneyField label={m.admin_field_free_shipping_from()} />
							)}
						</form.AppField>
						<Hint>{m.admin_settings_free_shipping_help()}</Hint>
					</div>
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
		settings.returnWindowDays,
		settings.freeShippingFrom,
		settings.lowStockThreshold,
	];
	return <OperationsForm key={JSON.stringify(stored)} settings={settings} />;
}
