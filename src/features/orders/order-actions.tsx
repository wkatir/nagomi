import { Link } from "@tanstack/react-router";
import { MoreHorizontalIcon, PrinterIcon } from "lucide-react";
import { useState } from "react";
import { HeaderActions } from "#/components/admin/page-header";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { AdminOrder } from "#/lib/api";
import { m } from "#/paraglide/messages";
import type { useOrderActions } from "./mutations";
import { RefundOrderDialog } from "./refund-order-dialog";
import { ReturnOrderDialog } from "./return-order-dialog";

export type OrderDialog = "ship" | "cancel" | "pay" | "return" | "refund";
type Actions = ReturnType<typeof useOrderActions>;
type Open = (dialog: OrderDialog) => void;
type Order = AdminOrder["order"];

// Offered only in the states the API (and the triggers) accept, so a refusal is rare.
export const canCancel = (order: Pick<Order, "status">) =>
	order.status === "pending" || order.status === "paid";

export const canShip = (order: Pick<Order, "status" | "paymentMethod">) =>
	order.status === "paid" ||
	(order.status === "pending" && order.paymentMethod === "cash_on_delivery");

export const canReturn = ({ order, lines }: AdminOrder) =>
	(order.status === "shipped" || order.status === "delivered") &&
	lines.some((line) => line.quantity > line.returned);

const takesPayment = ({ order, payment }: AdminOrder) =>
	["pending", "paid", "shipped"].includes(order.status) && payment.balance > 0;

export function OrderHeaderActions({
	detail,
	actions,
	open,
}: {
	detail: AdminOrder;
	actions: Actions;
	open: Open;
}) {
	const { order, payment } = detail;
	const busy = Object.values(actions).some((action) => action.isPending);
	const cod = order.paymentMethod === "cash_on_delivery";
	return (
		<HeaderActions>
			<Button variant="outline" asChild>
				<Link to="/admin/orders/$id/receipt" params={{ id: String(order.id) }}>
					<PrinterIcon aria-hidden />
					{m.admin_order_print_receipt()}
				</Link>
			</Button>
			{order.status === "pending" && !cod && takesPayment(detail) && (
				<Button className="max-sm:flex-1" onClick={() => open("pay")}>
					{m.admin_order_mark_paid()}
				</Button>
			)}
			{canShip(order) && (
				<Button className="max-sm:flex-1" onClick={() => open("ship")}>
					{m.admin_order_mark_shipped()}
				</Button>
			)}
			{order.status === "shipped" && cod && payment.balance > 0 && (
				<Button className="max-sm:flex-1" onClick={() => open("pay")}>
					{m.admin_order_record_cash()}
				</Button>
			)}
			{order.status === "shipped" && (
				<Button
					className="max-sm:flex-1"
					disabled={busy || payment.balance > 0}
					title={
						payment.balance > 0 ? m.admin_order_cod_needs_cash() : undefined
					}
					onClick={() => actions.deliver.mutate()}
				>
					{m.admin_order_mark_delivered()}
				</Button>
			)}
			{canCancel(order) && (
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							aria-label={m.admin_order_more_actions()}
						>
							<MoreHorizontalIcon aria-hidden />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => open("cancel")}
						>
							{m.admin_order_cancel()}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</HeaderActions>
	);
}

export function ReturnAction({
	detail,
	open,
}: {
	detail: AdminOrder;
	open: Open;
}) {
	return canReturn(detail) ? (
		<Button size="sm" variant="outline" onClick={() => open("return")}>
			{m.admin_order_return()}
		</Button>
	) : null;
}

export function PaymentActions({
	detail,
	open,
}: {
	detail: AdminOrder;
	open: Open;
}) {
	const { payment } = detail;
	const takes = takesPayment(detail);
	if (!takes && payment.refundable <= 0) return null;
	return (
		<div className="flex gap-2">
			{takes && (
				<Button size="sm" variant="outline" onClick={() => open("pay")}>
					{m.admin_order_mark_paid()}
				</Button>
			)}
			{payment.refundable > 0 && (
				<Button size="sm" variant="outline" onClick={() => open("refund")}>
					{m.admin_order_refund()}
				</Button>
			)}
		</div>
	);
}

function TextDialog({
	title,
	description,
	fields,
	submit,
	onClose,
	onSubmit,
}: {
	title: string;
	description?: string;
	fields: { id: string; label: string; required: boolean }[];
	submit: string;
	onClose: () => void;
	onSubmit: (values: Record<string, string>) => void;
}) {
	const [values, setValues] = useState<Record<string, string>>({});
	const missing = fields.some((f) => f.required && !values[f.id]?.trim());
	return (
		<AlertDialog open onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent
				{...(description ? {} : { "aria-describedby": undefined })}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				{fields.map((f) => (
					<div key={f.id} className="grid gap-1.5">
						<Label htmlFor={f.id}>{f.label}</Label>
						<Input
							id={f.id}
							maxLength={200}
							value={values[f.id] ?? ""}
							onChange={(e) =>
								setValues((v) => ({ ...v, [f.id]: e.target.value }))
							}
						/>
					</div>
				))}
				<AlertDialogFooter>
					<AlertDialogCancel>{m.admin_cancel()}</AlertDialogCancel>
					<AlertDialogAction
						disabled={missing}
						onClick={() =>
							onSubmit(
								Object.fromEntries(
									Object.entries(values).map(([k, v]) => [k, v.trim()]),
								),
							)
						}
					>
						{submit}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function OrderDialogs({
	detail,
	actions,
	dialog,
	onClose,
}: {
	detail: AdminOrder;
	actions: Actions;
	dialog: OrderDialog | null;
	onClose: () => void;
}) {
	const { order, payment } = detail;
	switch (dialog) {
		case "ship":
			return (
				<TextDialog
					title={m.admin_order_ship_title({ code: order.code })}
					description={m.admin_order_ship_body()}
					fields={[
						{ id: "courier", label: m.admin_order_courier(), required: true },
						{
							id: "trackingCode",
							label: m.admin_order_tracking_code(),
							required: false,
						},
					]}
					submit={m.admin_order_mark_shipped()}
					onClose={onClose}
					onSubmit={(v) =>
						actions.ship.mutate({
							courier: v.courier ?? "",
							...(v.trackingCode ? { trackingCode: v.trackingCode } : {}),
						})
					}
				/>
			);
		case "pay":
			return (
				<TextDialog
					title={
						order.paymentMethod === "cash_on_delivery"
							? m.admin_order_record_cash()
							: m.admin_order_mark_paid()
					}
					fields={[
						{
							id: "reference",
							label: m.admin_order_payment_reference(),
							required: false,
						},
					]}
					submit={m.admin_order_mark_paid()}
					onClose={onClose}
					onSubmit={(v) => actions.markPaid.mutate(v.reference || undefined)}
				/>
			);
		case "cancel":
			return (
				<TextDialog
					title={m.admin_order_cancel_confirm({ code: order.code })}
					description={m.admin_order_cancel_body()}
					fields={[
						{
							id: "reason",
							label: m.admin_order_cancel_reason(),
							required: true,
						},
					]}
					submit={m.admin_order_cancel()}
					onClose={onClose}
					onSubmit={(v) => actions.cancel.mutate(v.reason ?? "")}
				/>
			);
		case "return":
			return <ReturnOrderDialog detail={detail} onClose={onClose} />;
		case "refund":
			return (
				<RefundOrderDialog
					order={order}
					refundable={payment.refundable}
					onClose={onClose}
				/>
			);
		case null:
			return null;
	}
}
