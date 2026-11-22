import { z } from "zod";
import { LOCALES, type Locale } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";

export const MAIN_TEXT_FIELDS = [
	"name",
	"tagline",
	"shortSpecs",
	"description",
] as const;
export const SEO_TEXT_FIELDS = ["seoTitle", "seoDescription"] as const;
export const TEXT_FIELDS = [...MAIN_TEXT_FIELDS, ...SEO_TEXT_FIELDS] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const textLabel: Record<TextField, () => string> = {
	name: m.admin_field_name,
	tagline: m.admin_field_tagline,
	shortSpecs: m.admin_field_short_specs,
	description: m.admin_field_description,
	seoTitle: m.admin_product_seo_title,
	seoDescription: m.admin_product_seo_description,
};

export const textRows: Partial<Record<TextField, number>> = {
	description: 4,
	seoDescription: 2,
};
export type TextValues = Record<TextField, string>;
export type TranslationValues = Record<Locale, TextValues>;

type StoredText = { name: string } & Record<
	Exclude<TextField, "name">,
	string | null
>;

const emptyText: TextValues = {
	name: "",
	tagline: "",
	shortSpecs: "",
	description: "",
	seoTitle: "",
	seoDescription: "",
};

const forEachLocale = <T>(make: (locale: Locale) => T): Record<Locale, T> => ({
	es: make("es"),
	en: make("en"),
});

export function translationValues(
	stored: ({ locale: Locale } & StoredText)[],
): TranslationValues {
	return forEachLocale((locale) => {
		const text = stored.find((t) => t.locale === locale);
		return text
			? {
					name: text.name,
					tagline: text.tagline ?? "",
					shortSpecs: text.shortSpecs ?? "",
					description: text.description ?? "",
					seoTitle: text.seoTitle ?? "",
					seoDescription: text.seoDescription ?? "",
				}
			: { ...emptyText };
	});
}

const isBlank = (text: TextValues) =>
	TEXT_FIELDS.every((field) => text[field].trim() === "");

export function translationsSchema({
	defaultLocale,
	stored,
}: {
	defaultLocale: Locale;
	stored: readonly Locale[];
}) {
	const text = z.object({
		name: z.string().trim().max(PRODUCT_LIMITS.name),
		tagline: z.string().trim().max(PRODUCT_LIMITS.tagline),
		shortSpecs: z.string().trim().max(PRODUCT_LIMITS.shortSpecs),
		description: z.string().trim().max(PRODUCT_LIMITS.description),
		seoTitle: z.string().trim().max(PRODUCT_LIMITS.seoTitle),
		seoDescription: z.string().trim().max(PRODUCT_LIMITS.seoDescription),
	});
	return z
		.object({ translations: z.object({ es: text, en: text }) })
		.superRefine((value, ctx) => {
			for (const locale of LOCALES) {
				const written = value.translations[locale];
				const needed =
					locale === defaultLocale ||
					stored.includes(locale) ||
					!isBlank(written);
				if (needed && written.name === "")
					ctx.addIssue({
						code: "custom",
						path: ["translations", locale, "name"],
						message: m.admin_required(),
					});
			}
		});
}

type TextPayload = {
	name: string;
	tagline: string | null;
	shortSpecs: string | null;
	description: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
};

const orNull = (text: string) => text.trim() || null;

export function translationsPayload(
	values: TranslationValues,
	started: TranslationValues,
): Partial<Record<Locale, TextPayload>> {
	const payload: Partial<Record<Locale, TextPayload>> = {};
	for (const locale of LOCALES) {
		const now = values[locale];
		if (
			TEXT_FIELDS.every(
				(field) => now[field].trim() === started[locale][field].trim(),
			)
		)
			continue;
		payload[locale] = {
			name: now.name.trim(),
			tagline: orNull(now.tagline),
			shortSpecs: orNull(now.shortSpecs),
			description: orNull(now.description),
			seoTitle: orNull(now.seoTitle),
			seoDescription: orNull(now.seoDescription),
		};
	}
	return payload;
}

export const productName = (
	product: { slug: string; translations: { locale: Locale; name: string }[] },
	locale: Locale,
) =>
	product.translations.find((t) => t.locale === locale)?.name ?? product.slug;

export function localesWithErrors(
	fieldMeta: Partial<Record<string, { errors: unknown[] }>>,
	root: string,
): Locale[] {
	return LOCALES.filter((locale) =>
		Object.entries(fieldMeta).some(
			([name, meta]) =>
				(name === `${root}.${locale}` ||
					name.startsWith(`${root}.${locale}.`)) &&
				meta !== undefined &&
				meta.errors.length > 0,
		),
	);
}
