import { z } from "zod";
import {
	LOCALES,
	type Locale,
	PROMOTION_STATUSES,
	PROMOTION_TYPES,
} from "#/lib/enums";
import { calendarDate } from "#/lib/schemas/dates";
import {
	PROMOTION_CODE,
	PROMOTION_MAX_AMOUNT,
	PROMOTION_MAX_USES,
} from "#/lib/schemas/promotions";
import { m } from "#/paraglide/messages";

type Amount = (text: string) => number | null;

// Locked terms (an order used the code) are not on the form, so they are not checked. A
// description can be changed but not removed: the default language's is required, and so is
// any language that already has one (`stored`).
export function promotionSchema({
	amount,
	locked,
	defaultLocale,
	stored,
}: {
	amount: Amount;
	locked: boolean;
	defaultLocale: Locale;
	stored: ReadonlySet<Locale>;
}) {
	const day = z.literal("").or(calendarDate);
	return z
		.object({
			code: z.string().trim().toUpperCase(),
			type: z.enum(PROMOTION_TYPES),
			value: z.string().trim(),
			minSubtotal: z.string().trim(),
			startsOn: day,
			endsOn: day,
			usageLimit: z.string().trim(),
			perCustomerLimit: z.string().trim(),
			status: z.enum(PROMOTION_STATUSES),
			translations: z.record(
				z.enum(LOCALES),
				z.object({ description: z.string().trim().max(200) }),
			),
		})
		.superRefine((v, ctx) => {
			const issue = (path: (string | number)[], message: string) =>
				ctx.addIssue({ code: "custom", path, message });
			if (!locked) {
				if (!PROMOTION_CODE.test(v.code))
					issue(["code"], m.admin_promotion_code_format());
				if (v.type === "percentage") {
					if (
						!/^\d+$/.test(v.value) ||
						Number(v.value) < 1 ||
						Number(v.value) > 100
					)
						issue(["value"], m.admin_promotion_percent_range());
				} else {
					const value = amount(v.value);
					if (value === null || value < 1 || value > PROMOTION_MAX_AMOUNT)
						issue(["value"], m.admin_invalid_amount());
				}
				if (v.minSubtotal !== "") {
					const minimum = amount(v.minSubtotal);
					if (minimum === null || minimum < 1 || minimum > PROMOTION_MAX_AMOUNT)
						issue(["minSubtotal"], m.admin_invalid_amount());
				}
			}
			for (const key of ["usageLimit", "perCustomerLimit"] as const)
				if (
					v[key] !== "" &&
					(!/^\d+$/.test(v[key]) ||
						Number(v[key]) < 1 ||
						Number(v[key]) > PROMOTION_MAX_USES)
				)
					issue([key], m.admin_promotion_limit_invalid());
			if (v.startsOn !== "" && v.endsOn !== "" && v.startsOn > v.endsOn)
				issue(["endsOn"], m.admin_promotion_dates_order());
			for (const locale of LOCALES)
				if (
					v.translations[locale].description === "" &&
					(locale === defaultLocale || stored.has(locale))
				)
					issue(["translations", locale, "description"], m.admin_required());
		});
}
export type PromotionValues = z.output<ReturnType<typeof promotionSchema>>;

function amountOf(amount: Amount, text: string) {
	const value = amount(text);
	if (value === null) throw new Error(`Invalid amount ${text}`);
	return value;
}

// The terms the API fixes once an order used the code.
export const promotionTerms = (v: PromotionValues, amount: Amount) => ({
	code: v.code,
	type: v.type,
	value: v.type === "percentage" ? Number(v.value) : amountOf(amount, v.value),
	minSubtotal: v.minSubtotal === "" ? null : amountOf(amount, v.minSubtotal),
});

export const promotionSettings = (v: PromotionValues) => ({
	startsOn: v.startsOn === "" ? null : v.startsOn,
	endsOn: v.endsOn === "" ? null : v.endsOn,
	usageLimit: v.usageLimit === "" ? null : Number(v.usageLimit),
	perCustomerLimit:
		v.perCustomerLimit === "" ? null : Number(v.perCustomerLimit),
	status: v.status,
});

export function changedTexts(
	v: PromotionValues,
	stored: ReadonlyMap<Locale, string>,
) {
	const texts: Partial<Record<Locale, { description: string }>> = {};
	for (const locale of LOCALES) {
		const { description } = v.translations[locale];
		if (description !== "" && description !== stored.get(locale))
			texts[locale] = { description };
	}
	return texts;
}
