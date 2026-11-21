import { cn } from "cn";
import { MARK_CUTOUT_PATH, WORDMARK } from "./brand-paths";

export function Wordmark({
	className,
	label,
}: {
	className?: string;
	label: string;
}) {
	return (
		<span
			className={cn("inline-flex text-[26px] leading-none", className)}
			role="img"
			aria-label={label}
		>
			<svg
				viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
				fill="currentColor"
				aria-hidden="true"
				style={{
					width: `${WORDMARK.width / 1000}em`,
					height: `${WORDMARK.height / 1000}em`,
				}}
			>
				<path d={WORDMARK.path} />
			</svg>
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
			viewBox="0 0 1000 1000"
			fill="currentColor"
			fillRule="evenodd"
			role="img"
			aria-label={label}
			className={cn("size-8 shrink-0", className)}
		>
			<path d={MARK_CUTOUT_PATH} />
		</svg>
	);
}
