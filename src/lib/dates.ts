// Instants are stored as UTC ISO strings; calendar dates (YYYY-MM-DD) and every business
// day are in the store's IANA time zone.

const DAY_MS = 86_400_000;

function wallClock(instant: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(instant);
	const part = (type: Intl.DateTimeFormatPartTypes) => {
		const value = parts.find((p) => p.type === type)?.value;
		if (value === undefined) throw new Error(`Intl returned no ${type}`);
		return Number(value);
	};
	return {
		year: part("year"),
		month: part("month"),
		day: part("day"),
		hour: part("hour"),
		minute: part("minute"),
		second: part("second"),
	};
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function parseDate(date: string) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Invalid calendar date ${date}`);
	return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

const formatDate = (utcMidnight: number) =>
	new Date(utcMidnight).toISOString().slice(0, 10);

// Same format SQLite writes (strftime('%Y-%m-%dT%H:%M:%SZ')), so strings compare in order.
export const toDbTimestamp = (instant: Date) =>
	`${instant.toISOString().slice(0, 19)}Z`;

const isoDate = (t: ReturnType<typeof wallClock>) =>
	`${pad(t.year, 4)}-${pad(t.month)}-${pad(t.day)}`;

export const localDate = (instant: Date, timeZone: string): string =>
	isoDate(wallClock(instant, timeZone));

export const storeToday = (timeZone: string) => localDate(new Date(), timeZone);

// The way a spreadsheet reads it.
export function localDateTime(instant: Date, timeZone: string): string {
	const t = wallClock(instant, timeZone);
	return `${isoDate(t)} ${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`;
}

export const addDays = (date: string, days: number) =>
	formatDate(parseDate(date) + days * DAY_MS);

export const daysBetween = (from: string, to: string) =>
	Math.round((parseDate(to) - parseDate(from)) / DAY_MS);

// Positive ahead of UTC (El Salvador: -360).
export function utcOffsetMinutes(instant: Date, timeZone: string): number {
	const t = wallClock(instant, timeZone);
	const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
	return Math.round(
		(wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000,
	);
}

// Both offsets around midnight are tried so a day whose midnight is skipped or repeated by
// a daylight saving change starts at its first local instant.
export function startOfLocalDay(date: string, timeZone: string): string {
	const midnight = parseDate(date);
	const a = midnight - utcOffsetMinutes(new Date(midnight), timeZone) * 60_000;
	const b = midnight - utcOffsetMinutes(new Date(a), timeZone) * 60_000;
	const onDay = [a, b]
		.sort((x, y) => x - y)
		.filter((t) => localDate(new Date(t), timeZone) === date);
	// In a gap at midnight both guesses fall before the day; it starts after the gap.
	const start = onDay[0] ?? Math.max(a, b) + Math.abs(a - b);
	return toDbTimestamp(new Date(start));
}

// Rejects dates that do not exist, such as 2026-02-31.
export function isCalendarDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return formatDate(parseDate(value)) === value;
}

export const withinDays = (
	date: string,
	startsOn: string | null,
	endsOn: string | null,
) =>
	(startsOn === null || startsOn <= date) &&
	(endsOn === null || date <= endsOn);

// In the store's zone, so server and browser render the same text.
export const formatInstant = (
	instant: string,
	locale: string,
	timeZone: string,
	options: Pick<Intl.DateTimeFormatOptions, "dateStyle" | "timeStyle">,
) =>
	new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
		new Date(instant),
	);

// A calendar date has no time zone.
export const formatCalendarDate = (
	date: string,
	locale: string,
	dateStyle: "long" | "medium" = "long",
) =>
	new Intl.DateTimeFormat(locale, {
		dateStyle,
		timeZone: "UTC",
	}).format(parseDate(date));

// Date pickers work with local midnight; both directions use the local fields, so the day
// never shifts with a time zone.
export const pickerDate = (date: string) => {
	const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!parts) throw new Error(`Invalid calendar date ${date}`);
	return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
};
export const fromPickerDate = (date: Date) =>
	`${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
