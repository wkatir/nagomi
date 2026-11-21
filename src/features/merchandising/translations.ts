import type { AnyFormApi } from "@tanstack/react-form";
import type { z } from "zod";
import { LOCALES, type Locale } from "#/lib/enums";
import { m } from "#/paraglide/messages";

export type Texts = Record<string, string>;
export type Translations<T extends Texts> = Record<Locale, T>;

const isBlank = (texts: Texts) =>
	Object.values(texts).every((value) => value.trim() === "");

// A stored language stays in use: text cannot be taken away, only changed.
export const languagesInUse = <T extends Texts>(
	translations: Translations<T>,
	stored: readonly Locale[],
	defaultLocale: Locale,
) =>
	LOCALES.filter(
		(locale) =>
			locale === defaultLocale ||
			stored.includes(locale) ||
			!isBlank(translations[locale]),
	);

export function requireInEachLanguage(
	ctx: z.RefinementCtx,
	translations: Translations<Texts>,
	inUse: readonly Locale[],
	field: string,
) {
	for (const locale of inUse)
		if (translations[locale][field] === "")
			ctx.addIssue({
				code: "custom",
				path: ["translations", locale, field],
				message: m.admin_required(),
			});
}

const sameTexts = (a: Texts, b: Texts) =>
	Object.keys(a).every((field) => a[field] === b[field]);

export function changedTexts<T extends Texts>(
	translations: Translations<T>,
	initial: Translations<T>,
	inUse: readonly Locale[],
) {
	const changed: [Locale, T][] = [];
	for (const locale of inUse)
		if (!sameTexts(translations[locale], initial[locale]))
			changed.push([locale, translations[locale]]);
	return changed;
}

// For the tabs of a form, since a closed tab hides its errors.
export const invalidLocales = (
	fieldMeta: Record<string, { errors: readonly unknown[] }>,
) =>
	LOCALES.filter((locale) =>
		Object.entries(fieldMeta).some(
			([name, meta]) =>
				name.startsWith(`translations.${locale}.`) && meta.errors.length > 0,
		),
	);

// A field shows its error only once touched, and those in a closed tab never were.
export function touchInvalidFields(
	form: Pick<AnyFormApi, "state" | "setFieldMeta">,
) {
	for (const [name, meta] of Object.entries(form.state.fieldMeta))
		if (meta && meta.errors.length > 0 && !meta.isTouched)
			form.setFieldMeta(name, (previous) => ({ ...previous, isTouched: true }));
}
