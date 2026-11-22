import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoneyInput } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { isCalendarDate, localDate } from "#/lib/dates";
import { storeQuery } from "#/lib/queries";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import { useRefreshAfterPurchaseChange } from "./mutations";
import type { Purchase } from "./queries";
import { checkReceipt } from "./receive-rules";

type Lot = {
	key: string;
	purchaseOrderItemId: number;
	label: string;
	sku: string;
	remaining: number;
	quantity: string;
	code: string;
};

const FIELD_OF = {
	receivedOn: "receivedOn",
	supplierInvoiceRef: "invoice",
	shippingCost: "shipping",
	notes: "notes",
} as const;
const fieldOf = (path: string) => {
	if (Object.hasOwn(FIELD_OF, path))
		return FIELD_OF[path as keyof typeof FIELD_OF];
	const lot = /^lots\.(\d+)\.(quantity|code)$/.exec(path);
	return lot ? (`lots[${lot[1]}].${lot[2]}` as const) : undefined;
};

const newLot = (item: Purchase["items"][number], quantity: number): Lot => ({
	key: crypto.randomUUID(),
	purchaseOrderItemId: item.id,
	label: variantLabel(item),
	sku: item.sku,
	remaining: item.quantity - item.received,
	quantity: quantity === 0 ? "" : String(quantity),
	code: "",
});

// Each lot gets a share of the shipping by value, which makes its landed cost. A product that
// came in two lots takes two rows.
export function ReceivePurchaseDialog({
	purchase,
	onClose,
}: {
	purchase: Purchase;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterPurchaseChange();
	const moneyInput = useMoneyInput();
	const { data: store } = useSuspenseQuery(storeQuery);
	const today = localDate(new Date(), store.timeZone);
	const open = purchase.items.filter((item) => item.received < item.quantity);

	const schema = z
		.object({
			receivedOn: z.string().refine(isCalendarDate, m.admin_required()),
			invoice: z.string().trim().max(60),
			// Required: a lot's landed cost can never change after receipt, so 0 must be typed.
			shipping: z.string(),
			notes: z.string().trim().max(1000),
			lots: z.array(
				z.object({
					key: z.string(),
					purchaseOrderItemId: z.number(),
					label: z.string(),
					sku: z.string(),
					remaining: z.number(),
					quantity: z.string(),
					code: z.string().trim().max(40),
				}),
			),
		})
		.superRefine((value, ctx) =>
			checkReceipt(value, ctx, {
				today,
				orderedOn: purchase.orderedOn,
				parseMoney: moneyInput.parse,
			}),
		);

	const receive = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const shippingCost = moneyInput.parse(value.shipping);
			if (shippingCost === null) throw new Error("Unchecked shipping cost");
			return parseResponse(
				api().admin["purchase-orders"][":id"].receive.$post({
					param: { id: String(purchase.id) },
					json: {
						receivedOn: value.receivedOn,
						supplierInvoiceRef: value.invoice || undefined,
						shippingCost,
						notes: value.notes || undefined,
						lots: value.lots.map((lot) => ({
							purchaseOrderItemId: lot.purchaseOrderItemId,
							quantity: Number(lot.quantity),
							code: lot.code || undefined,
						})),
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
			receivedOn: today,
			invoice: "",
			shipping: "",
			notes: "",
			lots: open.map((item) => newLot(item, item.quantity - item.received)),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await receive.mutateAsync(schema.parse(value));
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
			className="sm:max-w-3xl"
			title={m.admin_po_receive_title({ reference: purchase.reference })}
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
						{m.admin_po_receive_help()}
					</p>
					<div className="grid gap-4 sm:grid-cols-3">
						<form.AppField name="receivedOn">
							{(field) => <field.DateField label={m.admin_po_received_on()} />}
						</form.AppField>
						<form.AppField name="invoice">
							{(field) => (
								<field.TextField
									label={m.admin_po_supplier_invoice()}
									maxLength={60}
								/>
							)}
						</form.AppField>
						<form.AppField name="shipping">
							{(field) => (
								<field.MoneyField label={m.admin_po_receipt_shipping()} />
							)}
						</form.AppField>
					</div>
					<p className="type-meta text-muted-foreground">
						{m.admin_purchase_shipping_help()}
					</p>
					<form.AppField name="lots" mode="array">
						{(list) => (
							<ul className="rounded-md border">
								{list.state.value.map((lot, index) => (
									<li
										key={lot.key}
										className="grid gap-3 border-b p-admin-card last:border-b-0"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="grid">
												<span className="type-small">{lot.label}</span>
												<span className="type-meta text-muted-foreground">
													{lot.sku} ·{" "}
													{m.admin_purchase_remaining({ count: lot.remaining })}
												</span>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label={m.admin_purchase_remove_lot({
													product: lot.label,
												})}
												onClick={() => list.removeValue(index)}
											>
												<XIcon aria-hidden />
											</Button>
										</div>
										<div className="grid gap-3 sm:grid-cols-2">
											<form.AppField name={`lots[${index}].quantity`}>
												{(field) => (
													<field.TextField
														label={m.admin_quantity()}
														inputMode="numeric"
													/>
												)}
											</form.AppField>
											<form.AppField name={`lots[${index}].code`}>
												{(field) => (
													<field.TextField
														label={m.admin_lot_code()}
														maxLength={40}
													/>
												)}
											</form.AppField>
										</div>
									</li>
								))}
							</ul>
						)}
					</form.AppField>
					<div className="flex flex-wrap gap-2">
						{open.map((item) => (
							<Button
								key={item.id}
								type="button"
								variant="outline"
								size="sm"
								onClick={() => form.pushFieldValue("lots", newLot(item, 0))}
							>
								{m.admin_po_add_lot({ name: item.sku })}
							</Button>
						))}
					</div>
					<form.AppField name="notes">
						{(field) => (
							<field.TextareaField
								label={m.admin_purchase_receipt_notes()}
								maxLength={1000}
							/>
						)}
					</form.AppField>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_po_register()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
