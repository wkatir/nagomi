import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

export function OrderedItem({
	position,
	name,
	hint,
	note,
	first,
	last,
	onUp,
	onDown,
	onRemove,
}: {
	position: number;
	name: string;
	hint: string;
	note?: ReactNode;
	first: boolean;
	last: boolean;
	onUp: () => void;
	onDown: () => void;
	onRemove: () => void;
}) {
	return (
		<li className="flex items-center gap-3 border-b p-3 last:border-b-0">
			<span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted type-meta tabular-nums">
				{position}
			</span>
			<div className="grid min-w-0 flex-1">
				<span className="type-small break-words">{name}</span>
				<span className="type-meta break-words text-muted-foreground">
					{hint}
				</span>
			</div>
			{note}
			<div className="flex shrink-0">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={first}
					aria-label={m.admin_merch_move_up({ name })}
					onClick={onUp}
				>
					<ArrowUpIcon aria-hidden />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={last}
					aria-label={m.admin_merch_move_down({ name })}
					onClick={onDown}
				>
					<ArrowDownIcon aria-hidden />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={m.admin_merch_remove({ name })}
					onClick={onRemove}
				>
					<XIcon aria-hidden />
				</Button>
			</div>
		</li>
	);
}
