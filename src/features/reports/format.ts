import { useSuspenseQuery } from "@tanstack/react-query";
import { intlLocale } from "#/lib/intl";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const formatPercent = (ratio: number, locale: string) =>
	new Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: 1,
	}).format(ratio);

// A margin is null when there was no merchandise.
export function usePercent() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (ratio: number | null) =>
		ratio === null ? m.admin_report_na() : formatPercent(ratio, locale);
}
