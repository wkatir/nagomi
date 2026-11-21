import { isCalendarDate } from "#/lib/dates";

// "202705" becomes "2027-05" and "20270531" becomes "2027-05-31".
export function formatExpiryInput(raw: string) {
	const digits = raw.replace(/\D/g, "").slice(0, 8);
	if (digits.length <= 4) return digits;
	if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
	return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// A month-only label lasts to the end of its month, the day the API stores too.
export function expiryEnd(text: string): string | null {
	if (isCalendarDate(text)) return text;
	const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(text);
	if (!month) return null;
	const [, year, mm] = month;
	// Day 0 of the next month is the last of this one.
	const lastDay = new Date(Date.UTC(Number(year), Number(mm), 0)).getUTCDate();
	return `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
}
