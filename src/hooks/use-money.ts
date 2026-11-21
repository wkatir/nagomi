import { useSuspenseQuery } from "@tanstack/react-query";
import { intlLocale } from "#/lib/intl";
import {
	currencySymbol,
	formatMoney,
	moneyInput,
	parseMoney,
} from "#/lib/money";
import { storeQuery } from "#/lib/queries";
import { getLocale } from "#/paraglide/runtime";

export function useMoney() {
	const { data } = useSuspenseQuery(storeQuery);
	const locale = intlLocale(getLocale(), data.countryCode);
	return (amount: number) => formatMoney(amount, data.currency, locale);
}

export function useCurrencySymbol() {
	const { data } = useSuspenseQuery(storeQuery);
	return currencySymbol(
		data.currency,
		intlLocale(getLocale(), data.countryCode),
	);
}

export function useMoneyInput() {
	const { data } = useSuspenseQuery(storeQuery);
	return {
		parse: (input: string) => parseMoney(input, data.currency),
		toInput: (amount: number) => moneyInput(amount, data.currency),
	};
}
