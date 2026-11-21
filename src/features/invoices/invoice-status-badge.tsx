import { invoiceStatusLabel } from "#/components/admin/labels";
import { Badge } from "#/components/ui/badge";
import type { TaxDocumentStatus } from "#/lib/enums";

const VARIANT = {
	queued: "secondary",
	processing: "secondary",
	contingency: "secondary",
	sealed: "default",
	rejected: "destructive",
	failed: "destructive",
	voided: "outline",
} as const satisfies Record<TaxDocumentStatus, string>;

export function InvoiceStatusBadge({ status }: { status: TaxDocumentStatus }) {
	return (
		<Badge variant={VARIANT[status]}>{invoiceStatusLabel[status]()}</Badge>
	);
}
