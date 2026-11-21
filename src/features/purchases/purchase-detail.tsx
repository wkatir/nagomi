import { useState } from "react";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { PageHeader } from "#/components/admin/page-header";
import { PurchaseStatusBadge } from "#/components/admin/purchase-status-badge";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import {
	type PurchaseDialog,
	PurchaseDialogs,
	PurchaseHeaderActions,
	ReceiveAction,
} from "./purchase-actions";
import {
	PurchaseDetails,
	PurchaseLines,
	PurchaseReceipts,
	PurchaseSupplier,
} from "./purchase-sections";
import type { Purchase } from "./queries";

export function PurchaseDetail({ purchase }: { purchase: Purchase }) {
	const [dialog, setDialog] = useState<PurchaseDialog | null>(null);
	const formatDate = useStoreDate();
	return (
		<DetailPage>
			<PageHeader
				title={purchase.reference}
				badges={<PurchaseStatusBadge status={purchase.status} />}
				description={m.admin_purchase_from({
					supplier: purchase.supplier,
					date: formatDate(purchase.createdAt, { dateStyle: "long" }),
				})}
				action={<PurchaseHeaderActions purchase={purchase} open={setDialog} />}
			/>
			<DetailColumns
				aside={
					<>
						<PurchaseSupplier purchase={purchase} />
						<PurchaseDetails purchase={purchase} />
					</>
				}
			>
				<PurchaseLines
					purchase={purchase}
					action={<ReceiveAction purchase={purchase} open={setDialog} />}
				/>
				{purchase.receipts.length > 0 && (
					<PurchaseReceipts purchase={purchase} />
				)}
			</DetailColumns>
			<PurchaseDialogs
				purchase={purchase}
				dialog={dialog}
				onClose={() => setDialog(null)}
			/>
		</DetailPage>
	);
}
