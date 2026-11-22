import { cn } from "cn";
import { useMoney } from "#/hooks/use-money";
import { m } from "#/paraglide/messages";

export type PriceProps = {
	amount: number;
	compareAt?: number | null;
	size: "sm" | "lg";
	className?: string;
};

const sizes = {
	sm: "text-[0.9375rem]",
	lg: "text-[1.75rem] leading-none",
};

export function Price({ amount, compareAt, size, className }: PriceProps) {
	const money = useMoney();
	const was = compareAt != null && compareAt > amount ? compareAt : null;
	return (
		<span
			className={cn(
				"inline-flex flex-wrap items-baseline gap-x-2 tabular-nums",
				sizes[size],
				className,
			)}
		>
			{was !== null && <span className="sr-only">{m.ui_price_current()}</span>}
			<span className="font-semibold">{money(amount)}</span>
			{was !== null && (
				<s
					className={cn(
						"font-normal text-muted-foreground",
						size === "lg" ? "type-lead" : "text-[0.8em]",
					)}
				>
					<span className="sr-only">{m.ui_price_was()} </span>
					{money(was)}
				</s>
			)}
		</span>
	);
}
