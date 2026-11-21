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
import { useCalendarDate } from "#/hooks/use-store-date";
import { PERSON_DOCUMENT_TYPES } from "#/lib/schemas/invoices";
import { m } from "#/paraglide/messages";
import { useVoidInvoice } from "./mutations";
import type { AdminInvoice } from "./queries";

const FIELD_OF = {
	reason: "reason",
	"responsible.name": "name",
	"responsible.documentType": "documentType",
	"responsible.documentNumber": "documentNumber",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

// The limits of voidInvoiceInput, with the screen's messages.
export const voidSchema = () =>
	z.object({
		reason: z
			.string()
			.trim()
			.min(5, m.admin_invoice_void_reason_length())
			.max(200, m.admin_invoice_void_reason_length()),
		name: z.string().trim().min(1, m.admin_required()).max(100),
		documentType: z.enum(PERSON_DOCUMENT_TYPES),
		documentNumber: z.string().trim().min(1, m.admin_required()).max(20),
	});

type VoidableInvoice = AdminInvoice & { voidDeadline: string };

export function VoidInvoiceForm({
	doc,
	onClose,
}: {
	doc: VoidableInvoice;
	onClose: () => void;
}) {
	const formatDay = useCalendarDate();
	const voidDoc = useVoidInvoice(doc);
	const schema = voidSchema();
	const form = useAppForm({
		defaultValues: {
			reason: "",
			name: "",
			documentType: "13" as (typeof PERSON_DOCUMENT_TYPES)[number],
			documentNumber: "",
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				const v = schema.parse(value);
				try {
					await voidDoc.mutateAsync({
						reason: v.reason,
						responsible: {
							name: v.name,
							documentType: v.documentType,
							documentNumber: v.documentNumber,
						},
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
				<div className="grid gap-1">
					<p className="type-small">{m.admin_invoice_void_effect()}</p>
					<p className="type-meta text-muted-foreground">
						{m.admin_invoice_void_until({ date: formatDay(doc.voidDeadline) })}
					</p>
				</div>
				<form.AppField name="reason">
					{(field) => (
						<field.TextareaField
							label={m.admin_invoice_void_reason()}
							maxLength={200}
							rows={2}
						/>
					)}
				</form.AppField>
				<div className="grid gap-1.5">
					<div className="grid gap-admin-stack sm:grid-cols-2">
						<div className="sm:col-span-2">
							<form.AppField name="name">
								{(field) => (
									<field.TextField
										label={m.admin_invoice_void_responsible()}
										maxLength={100}
										autoComplete="off"
									/>
								)}
							</form.AppField>
						</div>
						<form.AppField name="documentType">
							{(field) => (
								<field.SelectField
									label={m.admin_invoice_doc_type()}
									options={PERSON_DOCUMENT_TYPES.map((type) => ({
										value: type,
										label: personDocumentLabel[type](),
									}))}
								/>
							)}
						</form.AppField>
						<form.AppField name="documentNumber">
							{(field) => (
								<field.TextField
									label={m.admin_invoice_doc_number()}
									maxLength={20}
									autoComplete="off"
								/>
							)}
						</form.AppField>
					</div>
					<p className="type-meta text-muted-foreground">
						{m.admin_invoice_void_responsible_note()}
					</p>
				</div>
				<form.FormError />
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						{m.admin_cancel()}
					</Button>
					<form.SubmitButton variant="destructive">
						{m.admin_invoice_void()}
					</form.SubmitButton>
				</DialogFooter>
			</form.AppForm>
		</form>
	);
}

export function VoidInvoiceDialog({
	doc,
	onClose,
}: {
	doc: VoidableInvoice;
	onClose: () => void;
}) {
	return (
		<AdminDialog
			onClose={onClose}
			title={m.admin_invoice_void_title({ code: doc.orderCode })}
		>
			<VoidInvoiceForm doc={doc} onClose={onClose} />
		</AdminDialog>
	);
}
