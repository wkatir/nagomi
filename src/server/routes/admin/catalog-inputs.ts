import { z } from "zod";
import { LOCALES, type Locale, SLUG_REGEX } from "#/db/schema";
import { idParam } from "#/server/validate";

export const localeParam = idParam.extend({ locale: z.enum(LOCALES) });

export const slug = z
	.string()
	.trim()
	.max(80)
	.regex(SLUG_REGEX, "Lowercase letters, digits and single hyphens");

export const requiredText = (max: number) => z.string().trim().min(1).max(max);
export const money = z.number().int().min(0).max(100_000_000);
export const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullable()
		.transform((v) => v || null);

export const seoFields = {
	seoTitle: optionalText(70).optional(),
	seoDescription: optionalText(160).optional(),
};

export const searchQuery = z.string().trim().min(1).max(80).optional();

// The handlers check the default locale's text: the default locale lives in the database.
export const translations = <T extends z.ZodType>(text: T) =>
	z
		.partialRecord(z.enum(LOCALES), text)
		.refine((t) => Object.keys(t).length > 0, "At least one locale");

export const translationEntries = <T>(t: Partial<Record<Locale, T>>) =>
	Object.entries(t) as [Locale, T][];
