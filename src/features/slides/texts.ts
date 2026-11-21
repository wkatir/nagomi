import { z } from "zod";
import { LOCALES, type Locale } from "#/lib/enums";
import { m } from "#/paraglide/messages";

export const TEXT_FIELDS = ["title", "body", "ctaLabel", "imageAlt"] as const;
type TextField = (typeof TEXT_FIELDS)[number];
export type SlideText = Record<TextField, string>;
export type SlideTexts = Record<Locale, SlideText>;

export function initialTexts(
	stored: readonly {
		locale: Locale;
		title: string;
		body: string | null;
		ctaLabel: string | null;
		imageAlt: string;
	}[],
): SlideTexts {
	const of = (locale: Locale): SlideText => {
		const text = stored.find((t) => t.locale === locale);
		return {
			title: text?.title ?? "",
			body: text?.body ?? "",
			ctaLabel: text?.ctaLabel ?? "",
			imageAlt: text?.imageAlt ?? "",
		};
	};
	return { es: of("es"), en: of("en") };
}

export function slideTextsSchema(options: {
	defaultLocale: Locale;
	stored: readonly Locale[];
}) {
	const text = z.object({
		title: z.string().trim().max(120),
		body: z.string().trim().max(300),
		ctaLabel: z.string().trim().max(40),
		imageAlt: z.string().trim().max(250),
	});
	return z
		.object({ translations: z.record(z.enum(LOCALES), text) })
		.superRefine(({ translations }, ctx) => {
			for (const locale of LOCALES) {
				const written = translations[locale];
				const empty = Object.values(written).every((value) => value === "");
				if (
					empty &&
					locale !== options.defaultLocale &&
					!options.stored.includes(locale)
				)
					continue;
				for (const field of ["title", "imageAlt"] as const)
					if (written[field] === "")
						ctx.addIssue({
							code: "custom",
							path: ["translations", locale, field],
							message: m.admin_required(),
						});
			}
		});
}

export function changedTexts(
	value: SlideTexts,
	initial: SlideTexts,
): Partial<SlideTexts> {
	const changed: Partial<SlideTexts> = {};
	for (const locale of LOCALES)
		if (
			TEXT_FIELDS.some(
				(field) => value[locale][field] !== initial[locale][field],
			)
		)
			changed[locale] = value[locale];
	return changed;
}

// So a tab out of sight can say it needs attention.
export function localesWithErrors(
	fieldMeta: Readonly<Record<string, { errors: readonly unknown[] }>>,
): Locale[] {
	return LOCALES.filter((locale) =>
		Object.entries(fieldMeta).some(
			([name, meta]) =>
				name.startsWith(`translations.${locale}.`) && meta.errors.length > 0,
		),
	);
}
