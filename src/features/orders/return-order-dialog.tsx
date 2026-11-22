import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { dispositionLabel, returnReasonLabel } from "#/components/admin/labels";
import { Panel } from "#/components/admin/panel";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { type AdminOrder, api, parseResponse } from "#/lib/api";
import {
	RETURN_DISPOSITIONS,
	RETURN_REASONS,
	type ReturnDisposition,
} from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { useRefreshAfterOrderChange } from "./mutations";

const reasonSchema = z.enum(RETURN_REASONS);
type Reason = z.infer<typeof reasonSchema>;

type ReturnLine = {
	orderItemId: number;
	label: string;
	left: number;
	lots: { value: string; label: string }[];
	lotId: string;
	quantity: string;
	disposition: ReturnDisposition;
};

const lineSchema = z.object({
	orderItemId: z.number(),
	label: z.string(),
	left: z.number(),
	lots: z.array(z.object({ value: z.string(), label: z.string() })),
	lotId: z.string(),
	quantity: z.string(),
	disposition: z.enum(RETURN_DISPOSITIONS),
});

const schema = z
	.object({
		reason: reasonSchema,
		note: z.string().trim().max(500),
		lines: z.array(lineSchema),
	})
	.superRefine((value, ctx) => {
		let units = 0;
		value.lines.forEach((line, index) => {
			if (line.quantity.trim() === "") return;
			const quantity = Number(line.quantity);
			const at = (field: string, message: string) =>
				ctx.addIssue({
					code: "custom",
					path: ["lines", index, field],
					message,
				});
			if (
				!/^\d+$/.test(line.quantity.trim()) ||
				quantity < 1 ||
				quantity > line.left
			)
				at("quantity", m.admin_order_return_over({ max: line.left }));
			else units += quantity;
			if (line.lots.length > 1 && line.lotId === "")
				at("lotId", m.admin_order_return_lot_required());
		});
		if (units === 0)
			ctx.addIssue({
				code: "custom",
				path: [],
				message: m.admin_order_needs_units(),
			});
	});

export function ReturnOrderDialog({
	detail,
	onClose,
}: {
	detail: AdminOrder;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterOrderChange();
	const { order } = detail;

	const lines: ReturnLine[] = detail.lines
		.filter((line) => line.quantity > line.returned)
		.map((line) => {
			const size = line.optionLabel;
			const lots = line.lots.map((lot) => ({
				value: String(lot.lotId),
				label: `${lot.code ?? `#${lot.lotId}`} (${lot.units})`,
			}));
			return {
				orderItemId: line.id,
				label: [line.brandName, line.name, size].filter(Boolean).join(" "),
				left: line.quantity - line.returned,
				lots,
				lotId: lots.length > 1 ? "" : (lots[0]?.value ?? ""),
				quantity: "",
				disposition: "restock",
			};
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.orders[":id"].returns.$post({
					param: { id: String(order.id) },
					json: {
						reason: value.reason,
						note: value.note || undefined,
						lines: value.lines
							.filter((line) => line.quantity.trim() !== "")
							.map((line) => ({
								orderItemId: line.orderItemId,
								lotId: line.lotId ? Number(line.lotId) : undefined,
								quantity: Number(line.quantity),
								disposition: line.disposition,
							})),
					},
				}),
			),
		onSuccess: async () => {
			await refresh();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			reason: "withdrawal" as Reason,
			note: "",
			lines,
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, () => undefined);
				}
			},
		},
	});

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-2xl"
			title={m.admin_order_return_title({ code: order.code })}
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
					<form.AppField name="reason">
						{(field) => (
							<field.SelectField
								label={m.admin_order_return_reason()}
								options={reasonSchema.options.map((reason) => ({
									value: reason,
									label: returnReasonLabel[reason](),
								}))}
							/>
						)}
					</form.AppField>
					<form.AppField name="lines" mode="array">
						{(list) => (
							<>
								{list.state.value.map((line, index) => (
									<Panel key={line.orderItemId} className="grid gap-3 p-3">
										<div className="grid">
											<span>{line.label}</span>
											<span className="type-meta text-muted-foreground">
												{m.admin_order_return_left({ count: line.left })}
											</span>
										</div>
										<div className="grid gap-3 sm:grid-cols-3">
											<form.AppField name={`lines[${index}].quantity`}>
												{(field) => (
													<field.TextField
														label={m.admin_order_return_units()}
														inputMode="numeric"
													/>
												)}
											</form.AppField>
											<form.AppField name={`lines[${index}].disposition`}>
												{(field) => (
													<field.SelectField
														label={m.admin_order_return_disposition()}
														options={RETURN_DISPOSITIONS.map((disposition) => ({
															value: disposition,
															label: dispositionLabel[disposition](),
														}))}
													/>
												)}
											</form.AppField>
											{line.lots.length > 1 && (
												<form.AppField name={`lines[${index}].lotId`}>
													{(field) => (
														<field.SelectField
															label={m.admin_order_return_lot()}
															options={[{ value: "", label: "" }, ...line.lots]}
														/>
													)}
												</form.AppField>
											)}
										</div>
									</Panel>
								))}
							</>
						)}
					</form.AppField>
					<form.AppField name="note">
						{(field) => (
							<field.TextareaField
								label={m.admin_order_return_note()}
								maxLength={500}
							/>
						)}
					</form.AppField>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_order_return()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
