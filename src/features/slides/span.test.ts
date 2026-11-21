import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { slideSpan } from "./span";

const day = (value: string) => `<${value}>`;

describe("slideSpan", () => {
	test("says nothing for a slide without dates", () => {
		expect(slideSpan({ startsOn: null, endsOn: null }, day)).toBeNull();
	});

	test("names both days of a closed range", () => {
		expect(
			slideSpan({ startsOn: "2026-10-01", endsOn: "2026-10-31" }, day),
		).toBe(m.admin_slide_between({ from: "<2026-10-01>", to: "<2026-10-31>" }));
	});

	test("names the one day of a range that is open on the other side", () => {
		expect(slideSpan({ startsOn: "2026-10-01", endsOn: null }, day)).toBe(
			m.admin_slide_from({ date: "<2026-10-01>" }),
		);
		expect(slideSpan({ startsOn: null, endsOn: "2026-10-31" }, day)).toBe(
			m.admin_slide_until({ date: "<2026-10-31>" }),
		);
	});
});
