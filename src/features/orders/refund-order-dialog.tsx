import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoney, useMoneyInput } from "#/hooks/use-money";
import { type AdminOrder, api, parseResponse } from "#/lib/api";
import { PAYMENT_METHODS } from "#/lib/enums";
import { paymentLabel } from "#/lib/payment";
import { m } from "#/paraglide/messages";
import { useRefreshAfterOrderChange } from "./mutations";

const FIELD_OF = {
	amount: "amount",
	method: "method",
	reference: "reference",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

export function RefundOrderDialog({
	order,
	refundable,
	onClose,
}: {
	order: AdminOrder["order"];
	refundable: number;
	onClose: () => void;
}) {
	if (order.paymentMethod === null)
		throw new Error(
			`Order ${order.code} has money to refund but no payment method`,
		);
	const refresh = useRefreshAfterOrderChange();
	const money = useMoney();
	const moneyInput = useMoneyInput();

	const schema = z
		.object({
			amount: z.string(),
			method: z.enum(PAYMENT_METHODS),
			reference: z.string().trim().max(120),
		})
		.superRefine((value, ctx) => {
			const amount = moneyInput.parse(value.amount);
			const issue = (message: string) =>
				ctx.addIssue({ code: "custom", path: ["amount"], message });
			if (amount === null || amount <= 0) issue(m.admin_invalid_amount());
			else if (amount > refundable)
				issue(m.admin_order_refund_over({ max: money(refundable) }));
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const amount = moneyInput.parse(value.amount);
			if (amount === null) throw new Error("Invalid refund amount");
			return parseResponse(
				api().admin.orders[":id"].refunds.$post({
					param: { id: String(order.id) },
					json: {
						amount,
						method: value.method,
						reference: value.reference || undefined,
					},
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			amount: moneyInput.toInput(refundable),
			method: order.paymentMethod,
			reference: "",
		},
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

	return (
		<AdminDialog
			onClose={onClose}
			title={m.admin_order_refund_title({ code: order.code })}
		>
			<form
				noValidate
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.AppForm>
					<form.AppField name="amount">
						{(field) => (
							<field.MoneyField label={m.admin_order_refund_amount()} />
						)}
					</form.AppField>
					<form.AppField name="method">
						{(field) => (
							<field.SelectField
								label={m.admin_order_refund_method()}
								options={PAYMENT_METHODS.map((method) => ({
									value: method,
									label: paymentLabel[method](),
								}))}
							/>
						)}
					</form.AppField>
					<form.AppField name="reference">
						{(field) => (
							<field.TextField
								label={m.admin_order_refund_reference()}
								maxLength={120}
							/>
						)}
					</form.AppField>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_order_refund()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
