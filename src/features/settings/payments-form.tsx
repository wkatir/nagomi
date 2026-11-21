import { useAppForm } from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import type { AdminSettings } from "#/lib/api";
import { PAYMENT_METHODS, type PaymentMethod } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { paymentLabel } from "#/lib/payment";
import { m } from "#/paraglide/messages";
import { useSaveSettings } from "./mutations";

function PaymentsForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();
	const accepted = settings.acceptedPaymentMethods;
	const defaultValues: Record<PaymentMethod, boolean> = {
		bank_transfer: accepted.includes("bank_transfer"),
		cash_on_delivery: accepted.includes("cash_on_delivery"),
		payment_link: accepted.includes("payment_link"),
		cash: accepted.includes("cash"),
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync({
						acceptedPaymentMethods: PAYMENT_METHODS.filter(
							(method) => value[method],
						),
					});
					return null;
				} catch (error) {
					return errorMessage(error);
				}
			},
		},
	});

	return (
		<form.AppForm>
			<FormCard
				title={m.admin_field_payment_methods()}
				description={m.admin_settings_payments_help()}
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
				<div className="grid gap-3">
					{PAYMENT_METHODS.map((method) => (
						<form.AppField key={method} name={method}>
							{(field) => (
								<field.CheckboxField label={paymentLabel[method]()} />
							)}
						</form.AppField>
					))}
				</div>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

// Keyed by what is stored, so a save remounts the form clean.
export function PaymentsCard({ settings }: { settings: AdminSettings }) {
	return (
		<PaymentsForm
			key={JSON.stringify(settings.acceptedPaymentMethods)}
			settings={settings}
		/>
	);
}
