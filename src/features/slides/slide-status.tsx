import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "#/components/ui/badge";
import { useCalendarDate } from "#/hooks/use-store-date";
import { localDate } from "#/lib/dates";
import type { ProductStatus } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import type { Slide } from "./queries";
import { type SlideState, slideState } from "./schedule";
import { slideSpan } from "./span";

type Dated = Pick<Slide, "status" | "startsOn" | "endsOn">;

export const slideStatusLabel = {
	draft: m.admin_slide_status_draft,
	published: m.admin_slide_status_published,
	archived: m.admin_slide_status_archived,
} as const satisfies Record<ProductStatus, () => string>;

const stateLabel = {
	draft: m.admin_slide_status_draft,
	live: m.admin_slide_status_published,
	scheduled: m.admin_slide_status_scheduled,
	ended: m.admin_slide_status_ended,
	archived: m.admin_slide_status_archived,
} as const satisfies Record<SlideState, () => string>;

export const stateNote = {
	draft: m.admin_slide_note_draft,
	live: m.admin_slide_note_live,
	scheduled: m.admin_slide_note_scheduled,
	ended: m.admin_slide_note_ended,
	archived: m.admin_slide_note_archived,
} as const satisfies Record<SlideState, () => string>;

export function useSlideState() {
	const { data: store } = useSuspenseQuery(storeQuery);
	return (slide: Dated) =>
		slideState(slide, localDate(new Date(), store.timeZone));
}

export function useSlideSpan() {
	const formatDay = useCalendarDate();
	return (slide: Pick<Slide, "startsOn" | "endsOn">) =>
		slideSpan(slide, formatDay);
}

export function SlideStatusBadge({ slide }: { slide: Dated }) {
	const state = useSlideState()(slide);
	return (
		<Badge
			variant={
				state === "live"
					? "default"
					: state === "draft"
						? "secondary"
						: "outline"
			}
		>
			{stateLabel[state]()}
		</Badge>
	);
}
