import { useSuspenseQuery } from "@tanstack/react-query";
import { formatCalendarDate, formatInstant } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { storeQuery } from "#/lib/queries";
import { getLocale } from "#/paraglide/runtime";

export function useStoreDate() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (
		instant: string,
		options: Parameters<typeof formatInstant>[3] = { dateStyle: "long" },
	) => formatInstant(instant, locale, data.timeZone, options);
}

// A calendar date (YYYY-MM-DD) has no time zone.
export function useCalendarDate() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (day: string) => formatCalendarDate(day, locale);
}
