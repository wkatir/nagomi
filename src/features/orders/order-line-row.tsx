import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

// `quantity` is a node because each form brings its own field, typed to that form.
export function OrderLineRow({
	label,
	hint,
	quantity,
	onRemove,
}: {
	label: string;
	hint: string;
	quantity: ReactNode;
	onRemove: () => void;
}) {
	return (
		<div className="grid grid-cols-[1fr_8rem_auto] items-start gap-3">
			<div className="grid">
				<span>{label}</span>
				<span className="type-meta text-muted-foreground tabular-nums">
					{hint}
				</span>
			</div>
			{quantity}
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="mt-6"
				aria-label={m.admin_order_remove_line({ product: label })}
				onClick={onRemove}
			>
				<XIcon aria-hidden />
			</Button>
		</div>
	);
}
