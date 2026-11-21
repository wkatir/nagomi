import type { Locale } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import type { RoutineDetail } from "./queries";

// Mirrors the API's publishing rules.
export function missingToPublish(
	routine: Pick<RoutineDetail, "translations" | "items">,
	defaultLocale: Locale,
) {
	const missing: ("title" | "steps")[] = [];
	if (!routine.translations.some((t) => t.locale === defaultLocale))
		missing.push("title");
	if (routine.items.length === 0) missing.push("steps");
	return missing;
}

export const missingLabel = {
	title: m.admin_merch_needs_title,
	steps: m.admin_routine_needs_steps,
} as const;
