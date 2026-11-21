import { productStatusLabel } from "#/components/admin/labels";
import { Badge } from "#/components/ui/badge";
import type { ProductStatus } from "#/lib/enums";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
	return (
		<Badge
			variant={
				status === "published"
					? "default"
					: status === "draft"
						? "secondary"
						: "outline"
			}
		>
			{productStatusLabel[status]()}
		</Badge>
	);
}
