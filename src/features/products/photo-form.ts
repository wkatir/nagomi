import { z } from "zod";
import { LOCALES, type Locale } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";

export type AltValues = Record<Locale, string>;

export const altValues = (alt: Record<string, string>): AltValues => ({
	es: alt.es ?? "",
	en: alt.en ?? "",
});

export function altSchema(defaultLocale: Locale) {
	const text = z.string().trim().max(PRODUCT_LIMITS.alt);
	return z
		.object({ alt: z.object({ es: text, en: text }) })
		.superRefine((value, ctx) => {
			if (value.alt[defaultLocale] === "")
				ctx.addIssue({
					code: "custom",
					path: ["alt", defaultLocale],
					message: m.admin_required(),
				});
		});
}

// null removes the description of a language; an unchanged one is left out.
export function altPatch(
	started: AltValues,
	now: AltValues,
): Partial<Record<Locale, string | null>> {
	const patch: Partial<Record<Locale, string | null>> = {};
	for (const locale of LOCALES) {
		const text = now[locale].trim();
		if (text === started[locale].trim()) continue;
		patch[locale] = text === "" ? null : text;
	}
	return patch;
}

export function moved(
	ids: number[],
	index: number,
	by: -1 | 1,
): number[] | null {
	const target = index + by;
	if (target < 0 || target >= ids.length) return null;
	const next = [...ids];
	const [id] = next.splice(index, 1);
	if (id === undefined) throw new Error(`No photo at ${index}`);
	next.splice(target, 0, id);
	return next;
}
