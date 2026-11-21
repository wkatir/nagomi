import { z } from "zod";
import { LOCALES, type Locale } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";

export const MAIN_TEXT_FIELDS = [
	"name",
	"tagline",
	"description",
	"howToUse",
	"keyIngredients",
	"benefits",
	"cautions",
] as const;
export const SEO_TEXT_FIELDS = ["seoTitle", "seoDescription"] as const;
export const TEXT_FIELDS = [...MAIN_TEXT_FIELDS, ...SEO_TEXT_FIELDS] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const textLabel: Record<TextField, () => string> = {
	name: m.admin_field_name,
	tagline: m.admin_field_tagline,
	description: m.admin_field_description,
	howToUse: m.admin_field_how_to_use,
	keyIngredients: m.admin_field_key_ingredients,
	benefits: m.admin_field_benefits,
	cautions: m.admin_field_cautions,
	seoTitle: m.admin_product_seo_title,
	seoDescription: m.admin_product_seo_description,
};

export const textRows: Partial<Record<TextField, number>> = {
	description: 4,
	howToUse: 3,
	keyIngredients: 3,
	benefits: 3,
	cautions: 3,
	seoDescription: 2,
};
export type TextValues = Record<TextField, string>;
export type TranslationValues = Record<Locale, TextValues>;

type StoredText = Record<TextField, string | null>;

const emptyText: TextValues = {
	name: "",
	tagline: "",
	description: "",
	howToUse: "",
	keyIngredients: "",
	benefits: "",
	cautions: "",
	seoTitle: "",
	seoDescription: "",
};

const forEachLocale = <T>(make: (locale: Locale) => T): Record<Locale, T> => ({
	es: make("es"),
	en: make("en"),
});

// Nothing is copied from one language to another.
export function translationValues(
	stored: ({ locale: Locale } & StoredText)[],
): TranslationValues {
	return forEachLocale((locale) => {
		const text = stored.find((t) => t.locale === locale);
		return text
			? {
					name: text.name ?? "",
					tagline: text.tagline ?? "",
					description: text.description ?? "",
					howToUse: text.howToUse ?? "",
					keyIngredients: text.keyIngredients ?? "",
					benefits: text.benefits ?? "",
					cautions: text.cautions ?? "",
					seoTitle: text.seoTitle ?? "",
					seoDescription: text.seoDescription ?? "",
				}
			: { ...emptyText };
	});
}

const isBlank = (text: TextValues) =>
	TEXT_FIELDS.every((field) => text[field].trim() === "");

// A language left blank is not a translation, unless it is the store's or already stored.
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
		description: z.string().trim().max(PRODUCT_LIMITS.description),
		howToUse: z.string().trim().max(PRODUCT_LIMITS.howToUse),
		keyIngredients: z.string().trim().max(PRODUCT_LIMITS.keyIngredients),
		benefits: z.string().trim().max(PRODUCT_LIMITS.benefits),
		cautions: z.string().trim().max(PRODUCT_LIMITS.cautions),
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
	description: string | null;
	howToUse: string | null;
	keyIngredients: string | null;
	benefits: string | null;
	cautions: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
};

const orNull = (text: string) => text.trim() || null;

// Only the languages that changed, so one nobody typed in is never created.
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
			description: orNull(now.description),
			howToUse: orNull(now.howToUse),
			keyIngredients: orNull(now.keyIngredients),
			benefits: orNull(now.benefits),
			cautions: orNull(now.cautions),
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
