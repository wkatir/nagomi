import {
	type CountryCode,
	isSupportedCountry,
	isValidPhoneNumber,
	ParseError,
	parsePhoneNumberWithError,
} from "libphonenumber-js/max";
import { SV_PHONE_REGEX } from "#/lib/sv-locations";

export class InvalidPhoneError extends Error {
	constructor(readonly input: string) {
		super(`Invalid phone number ${input}`);
	}
}

// The E.164 number is the customer's identity: "7123-4567" and "+503 7123 4567" are one.
export function normalizePhone(input: string, defaultCountry: string): string {
	if (!isSupportedCountry(defaultCountry))
		throw new Error(`Unsupported phone country ${defaultCountry}`);
	try {
		const phone = parsePhoneNumberWithError(
			input,
			defaultCountry as CountryCode,
		);
		if (!phone.isValid()) throw new InvalidPhoneError(input);
		return phone.number;
	} catch (e) {
		if (e instanceof ParseError) throw new InvalidPhoneError(input);
		throw e;
	}
}

// Digits without "+", as wa.me expects.
export const isWhatsappNumber = (digits: string) =>
	isValidPhoneNumber(`+${digits}`);

export const displayPhone = (e164: string) =>
	parsePhoneNumberWithError(e164).formatInternational();

export function salvadoranE164(input: string, defaultCountry: string) {
	const phone = normalizePhone(input, defaultCountry);
	return SV_PHONE_REGEX.test(phone) ? phone : null;
}
