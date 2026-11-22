import { MoreHorizontalIcon } from "lucide-react";
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
import { m } from "#/paraglide/messages";
import { EditPurchaseDialog } from "./edit-purchase-dialog";
import { useCancelPurchase } from "./mutations";
import { PlacePurchaseDialog } from "./place-purchase-dialog";
import type { Purchase } from "./queries";
import { ReceivePurchaseDialog } from "./receive-purchase-dialog";

export type PurchaseDialog = "place" | "edit" | "cancel" | "receive";
type Open = (dialog: PurchaseDialog) => void;

const canCancel = (status: Purchase["status"]) =>
	status === "draft" || status === "ordered" || status === "partially_received";

const canReceive = (status: Purchase["status"]) =>
	status === "ordered" || status === "partially_received";

export function PurchaseHeaderActions({
	purchase,
	open,
}: {
	purchase: Purchase;
	open: Open;
}) {
	const { status } = purchase;
	if (!canCancel(status)) return null;
	return (
		<HeaderActions>
			{status === "draft" && (
				<Button className="max-sm:flex-1" onClick={() => open("place")}>
					{m.admin_purchase_place()}
				</Button>
			)}
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
					{status === "draft" && (
						<>
							<DropdownMenuItem onSelect={() => open("edit")}>
								{m.admin_edit()}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => open("cancel")}
					>
						{m.admin_purchase_cancel()}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</HeaderActions>
	);
}

export function ReceiveAction({
	purchase,
	open,
}: {
	purchase: Purchase;
	open: Open;
}) {
	return canReceive(purchase.status) ? (
		<Button size="sm" onClick={() => open("receive")}>
			{m.admin_po_receive()}
		</Button>
	) : null;
}

function CancelPurchaseDialog({
	purchase,
	onClose,
}: {
	purchase: Purchase;
	onClose: () => void;
}) {
	const cancel = useCancelPurchase(purchase.id);
	return (
		<AlertDialog open onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{m.admin_purchase_cancel_confirm({ reference: purchase.reference })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{purchase.status === "partially_received"
							? m.admin_purchase_cancel_partial()
							: m.admin_purchase_cancel_help()}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{m.admin_purchase_keep()}</AlertDialogCancel>
					<AlertDialogAction onClick={() => cancel.mutate()}>
						{m.admin_purchase_cancel()}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function PurchaseDialogs({
	purchase,
	dialog,
	onClose,
}: {
	purchase: Purchase;
	dialog: PurchaseDialog | null;
	onClose: () => void;
}) {
	switch (dialog) {
		case "place":
			return <PlacePurchaseDialog purchase={purchase} onClose={onClose} />;
		case "edit":
			return <EditPurchaseDialog purchase={purchase} onClose={onClose} />;
		case "receive":
			return <ReceivePurchaseDialog purchase={purchase} onClose={onClose} />;
		case "cancel":
			return <CancelPurchaseDialog purchase={purchase} onClose={onClose} />;
		case null:
			return null;
	}
}
