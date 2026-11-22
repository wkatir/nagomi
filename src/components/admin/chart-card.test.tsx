import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { m } from "#/paraglide/messages";
import { ChartCard, ChartCardSkeleton, ShareChartCard } from "./chart-card";

const card = (values: number[]) =>
	renderToStaticMarkup(
		<ChartCard
			title="Sales by day"
			categoryLabel="Day"
			seriesLabel="Sales"
			points={values.map((value, n) => ({
				key: `2026-10-0${n + 1}`,
				label: `${n + 1} oct`,
				value,
			}))}
			formatValue={(value) => `$${value / 100}`}
			formatTick={String}
		/>,
	);

describe("ChartCard", () => {
	test("has the title, the chart's place and a table with the same numbers", () => {
		const html = card([1500, 0, 3000]);
		expect(html).toContain("Sales by day");
		// The chart loads on demand: until it does, its room is a skeleton.
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("sr-only");
		expect(html).toContain("<caption>Sales by day</caption>");
		expect(html).toContain("<th");
		for (const cell of [
			"Day",
			"Sales",
			"1 oct",
			"$15",
			"2 oct",
			"$0",
			"3 oct",
			"$30",
		])
			expect(html).toContain(`>${cell}<`);
		expect(html).not.toContain(m.admin_report_chart_empty());
	});

	test("a series of zeros is told, not drawn", () => {
		const html = card([0, 0]);
		expect(html).toContain(m.admin_report_chart_empty());
		expect(html).not.toContain("<table");
		expect(html).not.toContain("<caption");
	});

	test("a series without points is told too", () => {
		expect(card([])).toContain(m.admin_report_chart_empty());
	});

	test("a loss is a number to draw, not an empty chart", () => {
		const html = card([-500, 0]);
		expect(html).toContain("<table");
		expect(html).toContain(">$-5<");
	});
});

describe("ChartCardSkeleton", () => {
	test("keeps the title and the room of the chart", () => {
		const html = renderToStaticMarkup(
			<ChartCardSkeleton title="Sales by day" />,
		);
		expect(html).toContain("Sales by day");
		expect(html).toContain("h-60");
		expect(html).not.toContain("<table");
	});
});

describe("ShareChartCard", () => {
	const share = (values: number[]) =>
		renderToStaticMarkup(
			<ShareChartCard
				title="Segments"
				categoryLabel="Segment"
				seriesLabel="Customers"
				parts={values.map((value, n) => ({
					key: `s${n}`,
					label: `Part ${n + 1}`,
					value,
				}))}
				formatValue={String}
			/>,
		);

	test("lists each part with its value and share, and tables them", () => {
		const html = share([3, 1]);
		expect(html).toContain("Part 1");
		expect(html).toContain("75 %");
		expect(html).toContain("25 %");
		expect(html).toContain("<caption>Segments</caption>");
	});

	test("nothing to share is told, not drawn", () => {
		expect(share([0, 0])).toContain(m.admin_report_chart_empty());
	});

	test("refuses more than five parts: a pie with more is unreadable", () => {
		expect(() => share([1, 1, 1, 1, 1, 1])).toThrow();
		expect(() => share([1, 1, 1, 1, 1])).not.toThrow();
	});
});
