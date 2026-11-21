import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

// The fields are nodes because each form brings its own, typed to that form.
export function PurchaseLineRow({
	label,
	sku,
	quantity,
	unitCost,
	total,
	onRemove,
}: {
	label: string;
	sku: string;
	quantity: ReactNode;
	unitCost: ReactNode;
	total: string;
	onRemove: () => void;
}) {
	return (
		<li className="grid grid-cols-2 gap-x-3 gap-y-2 border-b p-admin-card last:border-b-0 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_6rem_auto] sm:items-start">
			<div className="col-span-2 grid sm:col-span-1 sm:pt-6">
				<span className="type-small">{label}</span>
				<span className="type-meta text-muted-foreground">{sku}</span>
			</div>
			{quantity}
			{unitCost}
			<span className="type-small self-center tabular-nums sm:pt-6 sm:text-right">
				{total}
			</span>
			<div className="justify-self-end sm:pt-5">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={m.admin_purchase_remove_line({ product: label })}
					onClick={onRemove}
				>
					<XIcon aria-hidden />
				</Button>
			</div>
		</li>
	);
}
