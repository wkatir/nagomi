import { z } from "zod";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import type { AdminSettings } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { Hint } from "./hint";
import { useSaveSettings } from "./mutations";
import { numberText, optionalWholeNumber } from "./numbers";
import { settingsErrors } from "./server-errors";

const FIELDS = [
	"frequentCustomerMinOrders",
	"inactiveCustomerDays",
	"followupPendingPaymentHours",
	"followupPaidUnshippedHours",
	"followupShippedUndeliveredHours",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const schema = z.object({
	frequentCustomerMinOrders: optionalWholeNumber(2, 1000),
	inactiveCustomerDays: optionalWholeNumber(1, 3650),
	followupPendingPaymentHours: optionalWholeNumber(1, 2160),
	followupPaidUnshippedHours: optionalWholeNumber(1, 2160),
	followupShippedUndeliveredHours: optionalWholeNumber(1, 2160),
});

const label = {
	frequentCustomerMinOrders: m.admin_field_frequent_min_orders,
	inactiveCustomerDays: m.admin_field_inactive_days,
	followupPendingPaymentHours: m.admin_field_followup_pending,
	followupPaidUnshippedHours: m.admin_field_followup_paid,
	followupShippedUndeliveredHours: m.admin_field_followup_shipped,
} as const satisfies Record<(typeof FIELDS)[number], () => string>;

function CustomersForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();
	const form = useAppForm({
		defaultValues: Object.fromEntries(
			FIELDS.map((field) => [field, numberText(settings[field])]),
		) as Record<(typeof FIELDS)[number], string>,
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
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
				title={m.admin_settings_customers()}
				description={m.admin_settings_customers_help()}
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
				footer={<form.SaveButton>{m.admin_save()}</form.SaveButton>}
			>
				<div className="grid items-start gap-4 sm:grid-cols-2">
					{FIELDS.map((name) => (
						<form.AppField key={name} name={name}>
							{(field) => (
								<field.TextField label={label[name]()} inputMode="numeric" />
							)}
						</form.AppField>
					))}
				</div>
				<Hint>{m.admin_settings_customers_hint()}</Hint>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

export function CustomersCard({ settings }: { settings: AdminSettings }) {
	return (
		<CustomersForm
			key={JSON.stringify(FIELDS.map((field) => settings[field]))}
			settings={settings}
		/>
	);
}
