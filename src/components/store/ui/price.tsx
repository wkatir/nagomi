import { cn } from "cn";
import { useMoney } from "#/hooks/use-money";
import { m } from "#/paraglide/messages";

export type PriceProps = {
	/** Amount in the store currency's minor unit (cents). */
	amount: number;
	/** Earlier real price, in minor units. */
	compareAt?: number | null;
	size: "sm" | "lg";
	className?: string;
};

const sizes = {
	sm: "type-ui",
	lg: "type-stat",
};

export function Price({ amount, compareAt, size, className }: PriceProps) {
	const money = useMoney();
	// A compare-at price at or below the price is not a saving, so it is never shown.
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
			<span className="font-bold">{money(amount)}</span>
			{was !== null && (
				<s
					className={cn(
						"font-normal text-muted-foreground",
						size === "lg" ? "type-lead" : "text-[0.85em]",
					)}
				>
					<span className="sr-only">{m.ui_price_was()} </span>
					{money(was)}
				</s>
			)}
		</span>
	);
}
