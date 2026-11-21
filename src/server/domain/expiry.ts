import type { ExpiryPrecision } from "#/db/schema";
import { addDays, isCalendarDate } from "#/lib/dates";

export type Expiry = { expiresOn: string; precision: ExpiryPrecision };

export class InvalidExpiryError extends Error {
	constructor(readonly input: string) {
		super(`Invalid expiry ${input}: use YYYY-MM-DD or YYYY-MM`);
	}
}

// A month ("EXP 2027.05" -> "2027-05") is stored as its last day, so FEFO order and
// "expired" stay plain date comparisons; the precision keeps the label honest.
export function parseExpiry(input: string): Expiry {
	if (isCalendarDate(input)) return { expiresOn: input, precision: "day" };
	const month = /^(\d{4})-(\d{2})$/.exec(input);
	if (!month || !isCalendarDate(`${input}-01`))
		throw new InvalidExpiryError(input);
	const year = Number(month[1]);
	const next =
		month[2] === "12"
			? `${year + 1}-01-01`
			: `${month[1]}-${String(Number(month[2]) + 1).padStart(2, "0")}-01`;
	return { expiresOn: addDays(next, -1), precision: "month" };
}

export const formatExpiry = (expiresOn: string, precision: ExpiryPrecision) =>
	precision === "month" ? expiresOn.slice(0, 7) : expiresOn;
