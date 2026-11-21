import { useSuspenseQuery } from "@tanstack/react-query";
import { intlLocale } from "#/lib/intl";
import { minorDigits } from "#/lib/money";
import { storeQuery } from "#/lib/queries";
import type { Granularity } from "#/lib/schemas/reports";
import { getLocale } from "#/paraglide/runtime";

// A period is a calendar date (YYYY-MM-DD), so it is read as UTC midnight and formatted in UTC:
// no time zone can move it to another day.
export function formatPeriod(
	period: string,
	granularity: Granularity,
	locale: string,
): string {
	const format = new Intl.DateTimeFormat(
		locale,
		granularity === "month"
			? { month: "short", year: "numeric", timeZone: "UTC" }
			: { day: "numeric", month: "short", timeZone: "UTC" },
	);
	return format.format(new Date(`${period}T00:00:00Z`));
}

export function formatCompactMoney(
	amount: number,
	currency: string,
	locale: string,
): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		currencyDisplay: "narrowSymbol",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(amount / 10 ** minorDigits(currency));
}

export function usePeriodLabel() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (period: string, granularity: Granularity = "day") =>
		formatPeriod(period, granularity, locale);
}

export function useCompactMoney() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (amount: number) => formatCompactMoney(amount, data.currency, locale);
}
