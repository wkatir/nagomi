import { cn } from "cn";
import { Minus, Plus } from "lucide-react";
import { Button } from "#/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "#/components/ui/button-group";
import { m } from "#/paraglide/messages";

export function QuantityStepper({
	value,
	onChange,
	max,
	label,
	size = "sm",
	className,
}: {
	value: number;
	onChange: (quantity: number) => void;
	max: number;
	// Accessible name of the group, for example "Quantity of <product>".
	label: string;
	size?: "sm" | "lg";
	className?: string;
}) {
	const height = size === "lg" ? "h-(--control-xl)" : "h-(--control-lg)";
	const step = cn(
		height,
		"w-11 border-input px-0 has-[>svg]:px-0",
		size === "lg" && "w-12",
	);
	return (
		<ButtonGroup aria-label={label} className={cn("shrink-0", className)}>
			<Button
				type="button"
				variant="outline"
				aria-label={m.cart_decrease()}
				disabled={value <= 1}
				onClick={() => onChange(value - 1)}
				className={step}
			>
				<Minus aria-hidden />
			</Button>
			<ButtonGroupText
				className={cn(
					height,
					"min-w-10 justify-center border-input bg-background px-0 type-body tabular-nums",
				)}
			>
				<output aria-live="polite">{value}</output>
			</ButtonGroupText>
			<Button
				type="button"
				variant="outline"
				aria-label={m.cart_increase()}
				disabled={value >= max}
				onClick={() => onChange(value + 1)}
				className={step}
			>
				<Plus aria-hidden />
			</Button>
		</ButtonGroup>
	);
}
