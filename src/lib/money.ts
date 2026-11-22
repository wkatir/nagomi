// Amounts are integers in the currency's minor unit (cents for USD, none for JPY, fils for
// KWD); the number of decimals comes from Intl. `locale` is a full Intl locale (intlLocale).

export function minorDigits(currency: string): number {
	const digits = new Intl.NumberFormat("en", {
		style: "currency",
		currency,
	}).resolvedOptions().maximumFractionDigits;
	if (digits === undefined) throw new Error(`No minor unit for ${currency}`);
	return digits;
}

export function currencySymbol(currency: string, locale: string): string {
	const part = new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		currencyDisplay: "narrowSymbol",
	})
		.formatToParts(0)
		.find((p) => p.type === "currency");
	if (!part) throw new Error(`No symbol for ${currency}`);
	return part.value;
}

// narrowSymbol keeps "$" for dollars instead of "US$" outside the United States.
export function formatMoney(
	amount: number,
	currency: string,
	locale: string,
): string {
	const digits = minorDigits(currency);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		currencyDisplay: "narrowSymbol",
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(amount / 10 ** digits);
}

export function parseMoney(input: string, currency: string): number | null {
	const digits = minorDigits(currency);
	const match = /^(\d+)(?:[.,](\d*))?$/.exec(input.trim());
	if (!match) return null;
	const fraction = match[2] ?? "";
	if (fraction.length > digits) return null;
	const minor =
		Number(match[1]) * 10 ** digits +
		(digits === 0 ? 0 : Number(fraction.padEnd(digits, "0")));
	return Number.isSafeInteger(minor) ? minor : null;
}

export const moneyInput = (amount: number, currency: string) => {
	const digits = minorDigits(currency);
	return (amount / 10 ** digits).toFixed(digits);
};

export const basisPointsLabel = (bp: number) => `${bp / 100} %`;
