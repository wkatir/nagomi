import { cn } from "cn";
import {
	LOGO_WIDTH,
	MARK_GLYPH,
	MARK_GLYPH_SMALL,
	MARK_RING,
	MARK_RING_SMALL,
	WORDMARK,
	WORDMARK_KANA,
} from "#/components/brand/brand-paths";

type BrandProps = {
	className?: string;
	label?: string;
};

export function LogoMark({
	className,
	label = "Nagomi",
	compact = false,
}: BrandProps & { compact?: boolean }) {
	return (
		<svg
			viewBox="0 0 100 100"
			role="img"
			aria-label={label}
			fill="currentColor"
			className={cn("size-8 shrink-0", className)}
		>
			<path d={compact ? MARK_RING_SMALL : MARK_RING} />
			<path d={compact ? MARK_GLYPH_SMALL : MARK_GLYPH} />
		</svg>
	);
}

export function Logo({ className, label = "Nagomi" }: BrandProps) {
	return (
		<svg
			viewBox={`0 0 ${LOGO_WIDTH} 100`}
			role="img"
			aria-label={label}
			fill="currentColor"
			className={cn("h-10 w-auto shrink-0", className)}
		>
			<path d={MARK_RING} />
			<path d={MARK_GLYPH} />
			<path d={WORDMARK} />
			<path d={WORDMARK_KANA} />
		</svg>
	);
}

export function Wordmark({ className, label = "Nagomi" }: BrandProps) {
	return (
		<span className={cn("inline-flex text-[26px] leading-none", className)}>
			<Logo label={label} className="h-[1.6em]" />
		</span>
	);
}
