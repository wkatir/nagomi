import { describe, expect, test } from "bun:test";
import { slideState } from "./schedule";

const published = (startsOn: string | null, endsOn: string | null) => ({
	status: "published" as const,
	startsOn,
	endsOn,
});

describe("slideState", () => {
	test("a draft and an archived slide are their status, whatever their dates", () => {
		for (const status of ["draft", "archived"] as const)
			expect(
				slideState(
					{ status, startsOn: "2026-10-01", endsOn: "2026-10-31" },
					"2026-10-24",
				),
			).toBe(status);
	});

	test("a published slide without dates is live", () => {
		expect(slideState(published(null, null), "2026-10-24")).toBe("live");
	});

	test("the first and the last day are inside the dates", () => {
		const slide = published("2026-10-20", "2026-10-24");
		expect(slideState(slide, "2026-10-20")).toBe("live");
		expect(slideState(slide, "2026-10-24")).toBe("live");
	});

	test("the day before the start is scheduled, the day after the end is over", () => {
		const slide = published("2026-10-20", "2026-10-24");
		expect(slideState(slide, "2026-10-19")).toBe("scheduled");
		expect(slideState(slide, "2026-10-25")).toBe("ended");
	});

	test("an open side never ends the run", () => {
		expect(slideState(published("2026-10-20", null), "2030-01-01")).toBe(
			"live",
		);
		expect(slideState(published(null, "2026-10-24"), "2000-01-01")).toBe(
			"live",
		);
		expect(slideState(published("2026-10-20", null), "2026-10-19")).toBe(
			"scheduled",
		);
		expect(slideState(published(null, "2026-10-24"), "2026-10-25")).toBe(
			"ended",
		);
	});
});
