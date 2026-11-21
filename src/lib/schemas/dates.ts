import { z } from "zod";
import { isCalendarDate } from "#/lib/dates";

export const calendarDate = z.string().refine(isCalendarDate, "Invalid date");

// Local days of the store, both included. The schema that uses it ends with
// `.refine(fromNotAfterTo, fromAfterTo)`.
export const dayRange = {
	from: calendarDate.optional(),
	to: calendarDate.optional(),
};
export const fromNotAfterTo = (f: { from?: string; to?: string }) =>
	!f.from || !f.to || f.from <= f.to;
export const fromAfterTo = { message: "from is after to", path: ["to"] };
