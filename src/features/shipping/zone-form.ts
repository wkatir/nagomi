import { z } from "zod";
import {
	LOCALES,
	type Locale,
	SHIPPING_METHODS,
	SLUG_REGEX,
} from "#/lib/enums";
import {
	ZONE_MAX_AMOUNT,
	ZONE_MAX_DAYS,
	ZONE_MAX_POSITION,
} from "#/lib/schemas/shipping";
import { m } from "#/paraglide/messages";

type Amount = (text: string) => number | null;
type ZoneText = { name: string; description: string };

const whole = (text: string, max: number) =>
	/^\d+$/.test(text) && Number(text) <= max;

// A name can be changed but not removed: the default language's is always required, and so
// is that of any language that already has one (`stored`).
export function zoneSchema({
	amount,
	creating,
	defaultLocale,
	stored,
}: {
	amount: Amount;
	creating: boolean;
	defaultLocale: Locale;
	stored: ReadonlySet<Locale>;
}) {
	return z
		.object({
			slug: z.string().trim(),
			method: z.enum(SHIPPING_METHODS),
			fee: z.string().trim(),
			freeFrom: z.string().trim(),
			deliveryDaysMin: z.string().trim(),
			deliveryDaysMax: z.string().trim(),
			position: z.string().trim(),
			translations: z.record(
				z.enum(LOCALES),
				z.object({
					name: z.string().trim().max(80),
					description: z.string().trim().max(300),
				}),
			),
		})
		.superRefine((v, ctx) => {
			const issue = (path: (string | number)[], message: string) =>
				ctx.addIssue({ code: "custom", path, message });
			if (creating && (!SLUG_REGEX.test(v.slug) || v.slug.length > 80))
				issue(["slug"], m.admin_zone_slug_format());
			const fee = amount(v.fee);
			if (fee === null || fee > ZONE_MAX_AMOUNT)
				issue(["fee"], m.admin_invalid_amount());
			if (v.freeFrom !== "") {
				const freeFrom = amount(v.freeFrom);
				if (freeFrom === null || freeFrom > ZONE_MAX_AMOUNT)
					issue(["freeFrom"], m.admin_invalid_amount());
			}
			for (const key of ["deliveryDaysMin", "deliveryDaysMax"] as const)
				if (!whole(v[key], ZONE_MAX_DAYS))
					issue([key], m.admin_zone_days_invalid());
			if (
				whole(v.deliveryDaysMin, ZONE_MAX_DAYS) &&
				whole(v.deliveryDaysMax, ZONE_MAX_DAYS) &&
				Number(v.deliveryDaysMin) > Number(v.deliveryDaysMax)
			)
				issue(["deliveryDaysMax"], m.admin_zone_days_order());
			if (!whole(v.position, ZONE_MAX_POSITION))
				issue(["position"], m.admin_zone_position_invalid());
			for (const locale of LOCALES) {
				const { name, description } = v.translations[locale];
				if (
					name === "" &&
					(description !== "" || locale === defaultLocale || stored.has(locale))
				)
					issue(["translations", locale, "name"], m.admin_required());
			}
		});
}
export type ZoneValues = z.output<ReturnType<typeof zoneSchema>>;

function amountOf(amount: Amount, text: string) {
	const value = amount(text);
	if (value === null) throw new Error(`Invalid amount ${text}`);
	return value;
}

export const zoneFields = (v: ZoneValues, amount: Amount) => ({
	method: v.method,
	fee: amountOf(amount, v.fee),
	freeFrom: v.freeFrom === "" ? null : amountOf(amount, v.freeFrom),
	deliveryDaysMin: Number(v.deliveryDaysMin),
	deliveryDaysMax: Number(v.deliveryDaysMax),
	position: Number(v.position),
});

export function changedTexts(
	v: ZoneValues,
	stored: ReadonlyMap<Locale, { name: string; description: string | null }>,
) {
	const texts: Partial<Record<Locale, ZoneText>> = {};
	for (const locale of LOCALES) {
		const text = v.translations[locale];
		const before = stored.get(locale);
		if (
			text.name !== "" &&
			(text.name !== before?.name ||
				text.description !== (before?.description ?? ""))
		)
			texts[locale] = text;
	}
	return texts;
}
