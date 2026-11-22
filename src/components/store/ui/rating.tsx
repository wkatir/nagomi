import { useSuspenseQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Star } from "lucide-react";
import { intlLocale } from "#/lib/intl";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

type RatingValue = { average: number | null; count: number };

export function useAverageText() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (average: number) =>
		average.toLocaleString(locale, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
		});
}

export function Stars({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	return (
		<span className={cn("inline-flex gap-px", className)} aria-hidden>
			{[1, 2, 3, 4, 5].map((n) => (
				<Star
					key={n}
					className={cn(
						"size-[1em]",
						n <= Math.round(value)
							? "fill-current text-foreground"
							: "text-muted-foreground opacity-50",
					)}
				/>
			))}
		</span>
	);
}

export function Rating({
	rating,
	summary = false,
	className,
}: {
	rating: RatingValue;
	summary?: boolean;
	className?: string;
}) {
	const averageText = useAverageText();
	if (rating.average === null) return null;
	const average = averageText(rating.average);
	const label = m.product_rating_label({
		average,
		count: rating.count,
	});
	if (summary)
		return (
			<a
				href="#reviews"
				className={cn(
					"inline-flex items-center gap-2 type-small underline-offset-4 hover:underline",
					className,
				)}
			>
				<Stars value={rating.average} className="text-base" />
				<span aria-hidden>
					{m.reviews_summary({ average, count: String(rating.count) })}
				</span>
				<span className="sr-only">{label}</span>
			</a>
		);
	return (
		<p
			className={cn(
				"flex items-center gap-1.5 type-meta text-muted-foreground",
				className,
			)}
		>
			<Stars value={rating.average} className="text-[0.6875rem]" />
			<span aria-hidden className="tabular-nums">
				({rating.count})
			</span>
			<span className="sr-only">{label}</span>
		</p>
	);
}
