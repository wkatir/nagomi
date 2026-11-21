import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import type { AdminCustomer } from "./queries";

const FIELD_OF = {
	name: "name",
	phone: "phone",
	email: "email",
	notes: "notes",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

const PHONE_REFUSALS = ["duplicate_phone", "invalid_phone"];

// Name and phone cannot be cleared once they exist (an order needs them); email and notes can.
export function CustomerForm({
	customer,
	onClose,
}: {
	customer: AdminCustomer["customer"];
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const schema = z
		.object({
			name: z.string().trim().max(80),
			phone: z.string().trim().max(30),
			email: z.string().trim().max(120),
			notes: z.string().trim().max(1000),
		})
		.superRefine((v, ctx) => {
			const issue = (path: Field, message: string) =>
				ctx.addIssue({ code: "custom", path: [path], message });
			if (customer.name !== null && v.name === "")
				issue("name", m.admin_required());
			if (customer.phoneE164 !== null && v.phone === "")
				issue("phone", m.admin_required());
			if (v.email !== "" && !z.email().safeParse(v.email).success)
				issue("email", m.admin_customer_email_invalid());
		});

	const save = useMutation({
		mutationFn: (json: {
			name?: string;
			phone?: string;
			email?: string | null;
			notes?: string | null;
		}) =>
			parseResponse(
				api().admin.customers[":id"].$patch({
					param: { id: String(customer.id) },
					json,
				}),
			),
		// A customer's name and phone also show in their orders and in the search.
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
	});

	const form = useAppForm({
		defaultValues: {
			name: customer.name ?? "",
			phone: customer.phoneE164 ?? "",
			email: customer.email ?? "",
			notes: customer.notes ?? "",
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				const v = schema.parse(value);
				const json = {
					...(v.name !== "" && v.name !== customer.name
						? { name: v.name }
						: {}),
					...(v.phone !== "" && v.phone !== customer.phoneE164
						? { phone: v.phone }
						: {}),
					...(v.email !== (customer.email ?? "")
						? { email: v.email === "" ? null : v.email }
						: {}),
					...(v.notes !== (customer.notes ?? "")
						? { notes: v.notes === "" ? null : v.notes }
						: {}),
				};
				if (Object.keys(json).length === 0) {
					onClose();
					return null;
				}
				try {
					await save.mutateAsync(json);
					onClose();
					return null;
				} catch (error) {
					const code = apiErrorOf(error)?.code;
					if (code !== undefined && PHONE_REFUSALS.includes(code))
						return { fields: { phone: errorMessage(error) } };
					return serverErrors(error, fieldOf);
				}
			},
		},
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
			<form.AppForm>
				<form.AppField name="name">
					{(field) => (
						<field.TextField
							label={m.admin_order_customer_name()}
							maxLength={80}
						/>
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
							maxLength={120}
						/>
					)}
				</form.AppField>
				<form.AppField name="notes">
					{(field) => (
						<field.TextareaField
							label={m.admin_order_notes()}
							maxLength={1000}
						/>
					)}
				</form.AppField>
				<form.FormError />
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						{m.admin_cancel()}
					</Button>
					<form.SubmitButton>{m.admin_save()}</form.SubmitButton>
				</DialogFooter>
			</form.AppForm>
		</form>
	);
}

export function EditCustomerDialog({
	customer,
	onClose,
}: {
	customer: AdminCustomer["customer"];
	onClose: () => void;
}) {
	return (
		<AdminDialog onClose={onClose} title={m.admin_customer_edit_title()}>
			<CustomerForm customer={customer} onClose={onClose} />
		</AdminDialog>
	);
}
