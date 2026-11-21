import { describe, expect, test } from "bun:test";
import type { UseQueryResult } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { m } from "#/paraglide/messages";
import { ReportSelect, ReportState, ReportToolbar } from "./report-parts";

type Query = Pick<
	UseQueryResult<string>,
	| "isPending"
	| "isError"
	| "error"
	| "data"
	| "isPlaceholderData"
	| "isFetching"
	| "refetch"
>;
const settled: Query = {
	isPending: false,
	isError: false,
	error: null,
	data: "the report",
	isPlaceholderData: false,
	isFetching: false,
	refetch: () => Promise.reject(new Error("not used")),
};
const state = (query: Partial<Query>) =>
	renderToStaticMarkup(
		<ReportState query={{ ...settled, ...query } as UseQueryResult<string>}>
			{(report) => <p>{report}</p>}
		</ReportState>,
	);

describe("ReportState", () => {
	test("shows the report when it has arrived", () => {
		const html = state({});
		expect(html).toContain("<p>the report</p>");
		expect(html).toContain('aria-busy="false"');
		expect(html).not.toContain("opacity-60");
	});

	test("dims the previous report while the next one loads", () => {
		const html = state({ isPlaceholderData: true, isFetching: true });
		expect(html).toContain("<p>the report</p>");
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain("opacity-60");
	});

	test("shows a skeleton and no report on the first load", () => {
		const html = state({ isPending: true, data: undefined });
		expect(html).toContain("aria-busy");
		expect(html).toContain("animate-pulse");
		expect(html).not.toContain("the report");
	});

	test("shows what failed, with a way to try again, and no report", () => {
		const html = state({
			isError: true,
			error: new Error("Boom"),
			data: undefined,
		});
		expect(html).toContain(m.admin_table_retry());
		expect(html).not.toContain("the report");
	});
});

describe("ReportToolbar", () => {
	test("puts the CSV link after the controls", () => {
		const html = renderToStaticMarkup(
			<ReportToolbar csv="/api/admin/exports/reports/sales.csv?from=a">
				<span>controls</span>
			</ReportToolbar>,
		);
		expect(html.indexOf("controls")).toBeLessThan(html.indexOf("<a "));
		expect(html).toContain(
			'href="/api/admin/exports/reports/sales.csv?from=a"',
		);
		expect(html).toContain("download");
		expect(html).toContain(m.admin_export_csv());
	});
});

describe("ReportSelect", () => {
	test("offers its options, with the value on selected, under its name", () => {
		const html = renderToStaticMarkup(
			<ReportSelect
				label="Weeks"
				value={8}
				options={[4, 8, 12].map((value) => ({
					value,
					label: `${value} weeks`,
				}))}
				onChange={() => {}}
			/>,
		);
		expect(html).toContain('aria-label="Weeks"');
		const options = [
			...html.matchAll(
				/<option[^>]*value="(\d+)"( selected="")?[^>]*>([^<]*)<\/option>/g,
			),
		].map(([, value, selected, label]) => [value, Boolean(selected), label]);
		expect(options).toEqual([
			["4", false, "4 weeks"],
			["8", true, "8 weeks"],
			["12", false, "12 weeks"],
		]);
	});
});
