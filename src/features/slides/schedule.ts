import type { ProductStatus } from "#/lib/enums";

export type SlideState = "draft" | "live" | "scheduled" | "ended" | "archived";

// `today` and the dates are calendar days of the store (YYYY-MM-DD), so they compare as strings.
export function slideState(
	slide: {
		status: ProductStatus;
		startsOn: string | null;
		endsOn: string | null;
	},
	today: string,
): SlideState {
	if (slide.status !== "published") return slide.status;
	if (slide.startsOn !== null && today < slide.startsOn) return "scheduled";
	if (slide.endsOn !== null && today > slide.endsOn) return "ended";
	return "live";
}
