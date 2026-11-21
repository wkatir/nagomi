import { purchaseStatusLabel } from "#/components/admin/labels";
import { Badge } from "#/components/ui/badge";
import type { PurchaseOrderStatus } from "#/lib/enums";

export function PurchaseStatusBadge({
	status,
}: {
	status: PurchaseOrderStatus;
}) {
	return (
		<Badge
			variant={
				status === "draft"
					? "secondary"
					: status === "cancelled"
						? "outline"
						: "default"
			}
		>
			{purchaseStatusLabel[status]()}
		</Badge>
	);
}
