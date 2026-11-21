import { MoreHorizontalIcon } from "lucide-react";
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
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { AdminOrder } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { ConfirmOrderDialog } from "./confirm-order-dialog";
import { EditOrderDialog } from "./edit-order-dialog";
import type { useOrderActions } from "./mutations";
import { RefundOrderDialog } from "./refund-order-dialog";
import { ReturnOrderDialog } from "./return-order-dialog";

export type OrderDialog = "confirm" | "edit" | "cancel" | "return" | "refund";
type Actions = ReturnType<typeof useOrderActions>;
type Open = (dialog: OrderDialog) => void;

// Offered only in the states the API accepts, so a refusal is rare.
const canCancel = (status: AdminOrder["order"]["status"]) =>
	status === "pending" || status === "confirmed" || status === "fulfilled";

export const canReturn = ({ order, lines }: AdminOrder) =>
	(order.status === "fulfilled" || order.status === "delivered") &&
	lines.some((line) => line.quantity > line.returned);

// Editing and cancelling are behind "more": they are the exception.
export function OrderHeaderActions({
	detail,
	actions,
	open,
}: {
	detail: AdminOrder;
	actions: Actions;
	open: Open;
}) {
	const { status } = detail.order;
	const busy = Object.values(actions).some((action) => action.isPending);
	const hasMore = status === "pending" || canCancel(status);
	return (
		<HeaderActions>
			{status === "pending" && (
				<Button className="max-sm:flex-1" onClick={() => open("confirm")}>
					{m.admin_order_confirm()}
				</Button>
			)}
			{status === "confirmed" && (
				<Button
					className="max-sm:flex-1"
					disabled={busy}
					onClick={() => actions.fulfill.mutate()}
				>
					{m.admin_order_fulfill()}
				</Button>
			)}
			{status === "fulfilled" && (
				<Button
					className="max-sm:flex-1"
					disabled={busy}
					onClick={() => actions.deliver.mutate()}
				>
					{m.admin_order_deliver()}
				</Button>
			)}
			{hasMore && (
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
						{status === "pending" && (
							<DropdownMenuItem onSelect={() => open("edit")}>
								{m.admin_order_edit()}
							</DropdownMenuItem>
						)}
						{status === "pending" && canCancel(status) && (
							<DropdownMenuSeparator />
						)}
						{canCancel(status) && (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => open("cancel")}
							>
								{m.admin_order_cancel()}
							</DropdownMenuItem>
						)}
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
	actions,
	open,
}: {
	detail: AdminOrder;
	actions: Actions;
	open: Open;
}) {
	const { order, payment } = detail;
	const takes =
		order.status !== "pending" &&
		order.status !== "cancelled" &&
		payment.balance > 0;
	if (!takes && payment.refundable <= 0) return null;
	return (
		<div className="flex gap-2">
			{takes && (
				<Button
					size="sm"
					variant="outline"
					disabled={actions.markPaid.isPending}
					onClick={() => actions.markPaid.mutate()}
				>
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

function CancelOrderDialog({
	order,
	onClose,
	onCancel,
}: {
	order: AdminOrder["order"];
	onClose: () => void;
	onCancel: (reason: string | undefined) => void;
}) {
	const [reason, setReason] = useState("");
	return (
		<AlertDialog open onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent
				{...(order.status === "fulfilled"
					? {}
					: { "aria-describedby": undefined })}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{m.admin_order_cancel_confirm({ code: order.code })}
					</AlertDialogTitle>
					{order.status === "fulfilled" && (
						<AlertDialogDescription>
							{m.admin_order_cancel_returns()}
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<div className="grid gap-1.5">
					<Label htmlFor="cancel-reason">{m.admin_order_cancel_reason()}</Label>
					<Input
						id="cancel-reason"
						maxLength={200}
						value={reason}
						onChange={(event) => setReason(event.target.value)}
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>{m.admin_cancel()}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => onCancel(reason.trim() || undefined)}
					>
						{m.admin_order_cancel()}
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
		case "confirm":
			return <ConfirmOrderDialog order={order} onClose={onClose} />;
		case "edit":
			return <EditOrderDialog detail={detail} onClose={onClose} />;
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
		case "cancel":
			return (
				<CancelOrderDialog
					order={order}
					onClose={onClose}
					onCancel={(reason) => actions.cancel.mutate(reason)}
				/>
			);
		case null:
			return null;
	}
}
