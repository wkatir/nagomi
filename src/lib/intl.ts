export const intlLocale = (language: string, countryCode: string) =>
	`${language}-${countryCode}`;

const IANA_NAME = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

// Offsets such as "-06:00" are rejected: a zone name keeps daylight saving rules.
export function canonicalTimeZone(value: string): string | null {
	if (!IANA_NAME.test(value)) return null;
	try {
		return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
			.timeZone;
	} catch (e) {
		if (e instanceof RangeError) return null;
		throw e;
	}
}

const regions = new Intl.DisplayNames(["en"], {
	type: "region",
	fallback: "none",
});

// "ZZ" is Unknown Region.
export const isCountryCode = (value: string) =>
	/^[A-Z]{2}$/.test(value) && value !== "ZZ" && regions.of(value) !== undefined;

export const isCurrencyCode = (value: string) =>
	Intl.supportedValuesOf("currency").includes(value);
