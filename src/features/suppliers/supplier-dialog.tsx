import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { useRefreshAfterSupplierChange } from "./mutations";
import type { SupplierRow } from "./queries";

const FIELDS = [
	"name",
	"contactName",
	"phone",
	"email",
	"paymentTerms",
	"leadTimeDays",
	"notes",
] as const;
type Field = (typeof FIELDS)[number];
const fieldOf = (path: string): Field | undefined =>
	FIELDS.find((field) => field === path);

const MAX_LEAD_TIME_DAYS = 365;

const schema = z.object({
	name: z.string().trim().min(1, m.admin_required()).max(120),
	contactName: z.string().trim().max(120),
	phone: z.string().trim().max(40),
	email: z
		.string()
		.trim()
		.max(254)
		.refine(
			(email) => email === "" || z.email().safeParse(email).success,
			m.admin_supplier_invalid_email(),
		),
	paymentTerms: z.string().trim().max(500),
	leadTimeDays: z
		.string()
		.trim()
		.refine(
			(days) =>
				days === "" ||
				(/^\d+$/.test(days) && Number(days) <= MAX_LEAD_TIME_DAYS),
			m.admin_supplier_invalid_lead_time({ max: MAX_LEAD_TIME_DAYS }),
		),
	notes: z.string().trim().max(2000),
});

export function SupplierDialog({
	supplier,
	onClose,
}: {
	supplier: SupplierRow | null;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const refresh = useRefreshAfterSupplierChange();

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const json = {
				name: value.name,
				contactName: value.contactName || null,
				phone: value.phone || null,
				email: value.email || null,
				paymentTerms: value.paymentTerms || null,
				leadTimeDays:
					value.leadTimeDays === "" ? null : Number(value.leadTimeDays),
				notes: value.notes || null,
			};
			return supplier
				? parseResponse(
						api().admin.suppliers[":id"].$patch({
							param: { id: String(supplier.id) },
							json,
						}),
					)
				: parseResponse(api().admin.suppliers.$post({ json }));
		},
		onSuccess: async (saved) => {
			await refresh();
			onClose();
			if (!supplier)
				await navigate({
					to: "/admin/suppliers/$id",
					params: { id: saved.id },
				});
		},
	});

	const form = useAppForm({
		defaultValues: {
			name: supplier?.name ?? "",
			contactName: supplier?.contactName ?? "",
			phone: supplier?.phoneE164 ?? "",
			email: supplier?.email ?? "",
			paymentTerms: supplier?.paymentTerms ?? "",
			leadTimeDays:
				supplier?.leadTimeDays == null ? "" : String(supplier.leadTimeDays),
			notes: supplier?.notes ?? "",
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
			title={
				supplier
					? m.admin_supplier_edit_title({ name: supplier.name })
					: m.admin_supplier_new()
			}
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
					<form.AppField name="name">
						{(field) => (
							<field.TextField label={m.admin_field_name()} maxLength={120} />
						)}
					</form.AppField>
					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField name="contactName">
							{(field) => (
								<field.TextField
									label={m.admin_supplier_field_contact()}
									maxLength={120}
								/>
							)}
						</form.AppField>
						<form.AppField name="phone">
							{(field) => (
								<field.TextField
									label={m.admin_field_phone()}
									inputMode="tel"
									maxLength={40}
								/>
							)}
						</form.AppField>
					</div>
					<form.AppField name="email">
						{(field) => (
							<field.TextField
								label={m.admin_field_email()}
								type="email"
								maxLength={254}
							/>
						)}
					</form.AppField>
					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField name="leadTimeDays">
							{(field) => (
								<field.TextField
									label={m.admin_supplier_field_lead_time()}
									inputMode="numeric"
								/>
							)}
						</form.AppField>
						<form.AppField name="paymentTerms">
							{(field) => (
								<field.TextField
									label={m.admin_supplier_field_terms()}
									maxLength={500}
								/>
							)}
						</form.AppField>
					</div>
					<form.AppField name="notes">
						{(field) => (
							<field.TextareaField
								label={m.admin_supplier_field_notes()}
								maxLength={2000}
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
		</AdminDialog>
	);
}
