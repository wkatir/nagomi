import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { movementReasonLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import { MOVEMENT_REASONS } from "#/lib/enums";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import {
	type AdjustmentKind,
	checkAdjustment,
	signedQuantity,
} from "./adjustment-rules";
import { lotName } from "./lot-columns";
import { useRefreshAfterStockChange } from "./mutations";
import type { LotRow } from "./queries";

// A customer return is written by the returns flow.
const REASONS = MOVEMENT_REASONS.filter(
	(reason) => reason !== "customer_return",
);

const FIELD_OF = {
	kind: "kind",
	quantity: "quantity",
	reason: "reason",
	note: "note",
} as const;
const fieldOf = (path: string) =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

export function AdjustLotDialog({
	lot,
	onClose,
}: {
	lot: LotRow;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterStockChange();

	const schema = z
		.object({
			kind: z.enum(["waste", "adjustment"]),
			quantity: z.string(),
			reason: z.enum(REASONS),
			note: z.string().trim().max(200),
		})
		.superRefine((value, ctx) => checkAdjustment(value, ctx, lot.available));

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.inventory.adjustments.$post({
					json: {
						lotId: lot.lotId,
						kind: value.kind,
						quantity: signedQuantity(value.kind, Number(value.quantity)),
						reason: value.reason,
						note: value.note || undefined,
					},
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			kind: "waste" as AdjustmentKind,
			quantity: "1",
			reason: "damaged" as (typeof REASONS)[number],
			note: "",
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
	const kind = useStore(form.store, (state) => state.values.kind);

	return (
		<AdminDialog
			onClose={onClose}
			title={`${variantLabel(lot)} · ${m.admin_batch({ code: lotName(lot) })}`}
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
					<p className="type-small text-muted-foreground">
						{m.admin_lot_adjust_holds({ count: lot.available })}
					</p>
					<form.AppField name="kind">
						{(field) => (
							<field.SelectField
								label={m.admin_lot_adjust_kind()}
								options={[
									{ value: "waste", label: m.admin_adjust_waste() },
									{ value: "adjustment", label: m.admin_adjust_count() },
								]}
							/>
						)}
					</form.AppField>
					<form.AppField name="quantity">
						{(field) => (
							<field.TextField
								label={
									kind === "waste"
										? m.admin_adjust_units_out()
										: m.admin_adjust_units_signed()
								}
								inputMode="numeric"
							/>
						)}
					</form.AppField>
					<form.AppField name="reason">
						{(field) => (
							<field.SelectField
								label={m.admin_adjust_reason()}
								options={REASONS.map((reason) => ({
									value: reason,
									label: movementReasonLabel[reason](),
								}))}
							/>
						)}
					</form.AppField>
					<form.AppField name="note">
						{(field) => (
							<field.TextField
								label={m.admin_adjust_reason_note()}
								maxLength={200}
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
