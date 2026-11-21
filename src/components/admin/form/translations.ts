import type { z } from "zod";
import { LOCALES, type Locale } from "#/lib/enums";

export function invalidLocales(
	result: z.ZodSafeParseResult<unknown>,
): Locale[] {
	if (result.success) return [];
	const { issues } = result.error;
	return LOCALES.filter((locale) =>
		issues.some(
			(issue) => issue.path[0] === "translations" && issue.path[1] === locale,
		),
	);
}
