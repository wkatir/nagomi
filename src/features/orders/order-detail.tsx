import { useState } from "react";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import {
	orderStatusLabel,
	paymentStatusLabel,
} from "#/components/admin/labels";
import { PageHeader } from "#/components/admin/page-header";
import { Badge } from "#/components/ui/badge";
import { useStoreDate } from "#/hooks/use-store-date";
import type { AdminOrder } from "#/lib/api";
import { useOrderActions } from "./mutations";
import {
	type OrderDialog,
	OrderDialogs,
	OrderHeaderActions,
	PaymentActions,
	ReturnAction,
} from "./order-actions";
import {
	OrderCustomer,
	OrderDelivery,
	OrderLines,
	OrderMore,
	OrderPayments,
	OrderReturns,
} from "./order-sections";

export function OrderDetail({
	detail,
	initialDialog = null,
}: {
	detail: AdminOrder;
	initialDialog?: OrderDialog | null;
}) {
	const { order, payment } = detail;
	const actions = useOrderActions(order.id);
	const [dialog, setDialog] = useState<OrderDialog | null>(initialDialog);
	const formatDate = useStoreDate();
	return (
		<DetailPage>
			<PageHeader
				title={order.code}
				badges={
					<>
						<Badge
							variant={
								order.status === "pending"
									? "secondary"
									: order.status === "cancelled"
										? "outline"
										: "default"
							}
						>
							{orderStatusLabel[order.status]()}
						</Badge>
						<Badge variant="outline">
							{paymentStatusLabel[payment.status]()}
						</Badge>
					</>
				}
				description={formatDate(order.createdAt, {
					dateStyle: "long",
					timeStyle: "short",
				})}
				action={
					<OrderHeaderActions
						detail={detail}
						actions={actions}
						open={setDialog}
					/>
				}
			/>
			<DetailColumns
				aside={
					<>
						<OrderCustomer detail={detail} />
						<OrderDelivery detail={detail} />
						<OrderMore detail={detail} />
					</>
				}
			>
				<OrderLines
					detail={detail}
					action={<ReturnAction detail={detail} open={setDialog} />}
				/>
				<OrderPayments
					detail={detail}
					action={<PaymentActions detail={detail} open={setDialog} />}
				/>
				{detail.returns.length > 0 && <OrderReturns detail={detail} />}
			</DetailColumns>
			<OrderDialogs
				detail={detail}
				actions={actions}
				dialog={dialog}
				onClose={() => setDialog(null)}
			/>
		</DetailPage>
	);
}
