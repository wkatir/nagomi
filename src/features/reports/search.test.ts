import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { reportCsvHref, reportRange } from "./search";

afterEach(() => setSystemTime());

describe("reportRange", () => {
	test("is the days of the URL when it has them", () => {
		expect(
			reportRange(
				{ from: "2026-09-01", to: "2026-09-15" },
				"America/El_Salvador",
			),
		).toEqual({ from: "2026-09-01", to: "2026-09-15" });
	});

	test("is the last thirty days of the store, today included, when the URL has none", () => {
		setSystemTime(new Date("2026-10-24T12:00:00Z"));
		expect(reportRange({}, "America/El_Salvador")).toEqual({
			from: "2026-09-25",
			to: "2026-10-24",
		});
	});

	test("today is the store's: late in the evening there it is already tomorrow in UTC", () => {
		setSystemTime(new Date("2026-10-25T03:00:00Z"));
		expect(reportRange({}, "America/El_Salvador").to).toBe("2026-10-24");
		expect(reportRange({}, "UTC").to).toBe("2026-10-25");
	});
});

describe("reportCsvHref", () => {
	test("points at the export of the report with the same figures", () => {
		expect(
			reportCsvHref("losses", { from: "2026-10-01", to: "2026-10-31" }),
		).toBe(
			"/api/admin/exports/reports/losses.csv?from=2026-10-01&to=2026-10-31",
		);
	});

	test("the reports that end in a total ask for the row", () => {
		const range = { from: "2026-10-01", to: "2026-10-31" };
		for (const report of ["sales", "products", "brands"] as const)
			expect(reportCsvHref(report, range)).toBe(
				`/api/admin/exports/reports/${report}.csv?from=2026-10-01&to=2026-10-31&totals=true`,
			);
	});

	test("leaves out what is not set, and the query when nothing is", () => {
		expect(reportCsvHref("stock", {})).toBe(
			"/api/admin/exports/reports/stock.csv",
		);
		expect(reportCsvHref("reorder", { lookbackWeeks: 8, targetWeeks: 4 })).toBe(
			"/api/admin/exports/reports/reorder.csv?lookbackWeeks=8&targetWeeks=4",
		);
	});
});
