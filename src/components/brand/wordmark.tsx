import { cn } from "cn";

export function Wordmark({
	className,
	label,
}: {
	className?: string;
	label: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex font-serif text-[26px] leading-none font-light tracking-wide",
				className,
			)}
		>
			{label}
		</span>
	);
}

export function LogoMark({
	className,
	label,
}: {
	className?: string;
	label: string;
}) {
	return (
		<svg
			viewBox="0 0 100 100"
			role="img"
			aria-label={label}
			className={cn("size-8 shrink-0", className)}
		>
			<circle
				cx="50"
				cy="50"
				r="44"
				fill="none"
				stroke="currentColor"
				strokeWidth="6"
			/>
			<text
				x="50"
				y="52"
				textAnchor="middle"
				dominantBaseline="central"
				fontSize="52"
				fill="currentColor"
			>
				和
			</text>
		</svg>
	);
}
