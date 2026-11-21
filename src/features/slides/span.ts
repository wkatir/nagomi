import { m } from "#/paraglide/messages";

export function slideSpan(
	slide: { startsOn: string | null; endsOn: string | null },
	formatDay: (day: string) => string,
): string | null {
	const { startsOn, endsOn } = slide;
	if (startsOn !== null && endsOn !== null)
		return m.admin_slide_between({
			from: formatDay(startsOn),
			to: formatDay(endsOn),
		});
	if (startsOn !== null)
		return m.admin_slide_from({ date: formatDay(startsOn) });
	if (endsOn !== null) return m.admin_slide_until({ date: formatDay(endsOn) });
	return null;
}
