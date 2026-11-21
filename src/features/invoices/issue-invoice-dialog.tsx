import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { personDocumentLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import type { AdminOrder } from "#/lib/api";
import { PERSON_DOCUMENT_TYPES } from "#/lib/schemas/invoices";
import { m } from "#/paraglide/messages";
import { useIssueInvoice } from "./mutations";

const FIELD_OF = {
	"receptor.nombre": "nombre",
	"receptor.tipoDocumento": "tipoDocumento",
	"receptor.numeroDocumento": "numeroDocumento",
	"receptor.correo": "correo",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

export const issueSchema = z
	.object({
		inName: z.boolean(),
		nombre: z.string().trim(),
		tipoDocumento: z.enum(["", ...PERSON_DOCUMENT_TYPES]),
		numeroDocumento: z.string().trim(),
		correo: z.string().trim(),
	})
	.superRefine((v, ctx) => {
		if (!v.inName) return;
		const issue = (path: Field, message: string) =>
			ctx.addIssue({ code: "custom", path: [path], message });
		if (v.nombre === "") issue("nombre", m.admin_required());
		if (v.tipoDocumento !== "" && v.numeroDocumento === "")
			issue("numeroDocumento", m.admin_invoice_doc_number_required());
		if (v.tipoDocumento === "" && v.numeroDocumento !== "")
			issue("tipoDocumento", m.admin_invoice_doc_type_required());
		if (v.correo !== "" && !z.email().safeParse(v.correo).success)
			issue("correo", m.admin_customer_email_invalid());
	});
export type IssueValues = z.output<typeof issueSchema>;

// No buyer for a final consumer, else the details that were given.
export const receptorOf = (v: IssueValues) =>
	v.inName
		? {
				nombre: v.nombre,
				...(v.tipoDocumento !== ""
					? {
							tipoDocumento: v.tipoDocumento,
							numeroDocumento: v.numeroDocumento,
						}
					: {}),
				...(v.correo !== "" ? { correo: v.correo } : {}),
			}
		: undefined;

export function IssueInvoiceForm({
	order,
	onClose,
}: {
	order: AdminOrder["order"];
	onClose: () => void;
}) {
	const issue = useIssueInvoice(order.id);
	const form = useAppForm({
		defaultValues: {
			inName: false,
			nombre: order.customerName ?? "",
			tipoDocumento: "" as IssueValues["tipoDocumento"],
			numeroDocumento: "",
			correo: order.customerEmail ?? "",
		},
		validationLogic,
		validators: {
			onDynamic: issueSchema,
			onSubmitAsync: async ({ value }) => {
				try {
					await issue.mutateAsync({
						receptor: receptorOf(issueSchema.parse(value)),
					});
					onClose();
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});

	return (
		<form
			noValidate
			className="grid gap-admin-section"
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<div className="grid gap-1.5">
					<form.AppField name="inName">
						{(field) => <field.SwitchField label={m.admin_invoice_in_name()} />}
					</form.AppField>
					<p className="type-meta text-muted-foreground">
						{m.admin_invoice_in_name_note()}
					</p>
				</div>
				<form.Subscribe selector={(state) => state.values.inName}>
					{(inName) =>
						inName && (
							<div className="grid gap-admin-stack sm:grid-cols-2">
								<div className="sm:col-span-2">
									<form.AppField name="nombre">
										{(field) => (
											<field.TextField
												label={m.admin_field_name()}
												maxLength={250}
												autoComplete="off"
											/>
										)}
									</form.AppField>
								</div>
								<form.AppField name="tipoDocumento">
									{(field) => (
										<field.SelectField
											label={m.admin_invoice_doc_type()}
											options={[
												{ value: "", label: m.admin_invoice_doc_none() },
												...PERSON_DOCUMENT_TYPES.map((type) => ({
													value: type,
													label: personDocumentLabel[type](),
												})),
											]}
										/>
									)}
								</form.AppField>
								<form.AppField name="numeroDocumento">
									{(field) => (
										<field.TextField
											label={m.admin_invoice_doc_number()}
											maxLength={25}
											autoComplete="off"
										/>
									)}
								</form.AppField>
								<div className="sm:col-span-2">
									<form.AppField name="correo">
										{(field) => (
											<field.TextField
												label={m.admin_field_email()}
												type="email"
												maxLength={100}
												autoComplete="off"
											/>
										)}
									</form.AppField>
								</div>
							</div>
						)
					}
				</form.Subscribe>
				<form.FormError />
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						{m.admin_cancel()}
					</Button>
					<form.SubmitButton>{m.admin_invoice_issue()}</form.SubmitButton>
				</DialogFooter>
			</form.AppForm>
		</form>
	);
}

export function IssueInvoiceDialog({
	order,
	onClose,
}: {
	order: AdminOrder["order"];
	onClose: () => void;
}) {
	return (
		<AdminDialog
			onClose={onClose}
			title={m.admin_invoice_issue_title({ code: order.code })}
		>
			<IssueInvoiceForm order={order} onClose={onClose} />
		</AdminDialog>
	);
}
