import { describe, expect, test } from "bun:test";
import type { UseQueryResult } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import { m } from "#/paraglide/messages";
import { DataTable } from "./data-table";
import {
	type ListFeatures,
	type ListSearch,
	useDataTable,
} from "./use-data-table";

type Row = { id: number; code: string; total: number; note: string };
const column = createColumnHelper<ListFeatures, Row>();
const columns = column.columns([
	column.accessor("code", { header: "Code" }),
	column.accessor("total", { header: "Total", meta: { align: "right" } }),
	column.accessor("note", {
		header: "Note",
		enableSorting: false,
		meta: { hideOnMobile: true },
	}),
]);
const SORTS = ["code", "total"] as const;
type Query = Pick<
	UseQueryResult<unknown>,
	| "isPending"
	| "isError"
	| "error"
	| "isPlaceholderData"
	| "isFetching"
	| "refetch"
>;

const rows: Row[] = [
	{ id: 1, code: "ECL-1", total: 1500, note: "first" },
	{ id: 2, code: "ECL-2", total: 3000, note: "second" },
];
const settled: Query = {
	isPending: false,
	isError: false,
	error: null,
	isPlaceholderData: false,
	isFetching: false,
	refetch: () => Promise.reject(new Error("not used")),
};

function Harness({
	data = rows,
	total = rows.length,
	search = { page: 1, pageSize: 25, sort: "code", dir: "asc" },
	query = {},
	filtered = false,
}: {
	data?: Row[];
	total?: number;
	search?: ListSearch<(typeof SORTS)[number]>;
	query?: Partial<typeof settled>;
	filtered?: boolean;
}) {
	const table = useDataTable({
		data,
		columns,
		rowCount: total,
		search,
		sorts: SORTS,
		onSearchChange: () => {},
		getRowId: (row) => String(row.id),
	});
	return (
		<DataTable
			table={table}
			query={{ ...settled, ...query }}
			filtered={filtered}
			onClearFilters={() => {}}
			empty={<p>Nothing yet</p>}
		/>
	);
}
const html = (props?: Parameters<typeof Harness>[0]) =>
	renderToStaticMarkup(<Harness {...props} />);

describe("DataTable", () => {
	test("shows the rows and marks the sorted column on its header", () => {
		const out = html();
		expect(out).toContain("ECL-1");
		expect(out).toContain("ECL-2");
		expect(out).toMatch(/<th[^>]*aria-sort="ascending"[^>]*>.*?Code/);
		expect(out).toMatch(/<th[^>]*aria-sort="none"[^>]*>.*?Total/);
		const desc = html({
			search: { page: 1, pageSize: 25, sort: "total", dir: "desc" },
		});
		expect(desc).toMatch(/<th[^>]*aria-sort="descending"[^>]*>.*?Total/);
	});

	test("a column that cannot be sorted has no sort button and no aria-sort", () => {
		const out = html();
		const note = out.slice(out.indexOf(">Note<") - 200, out.indexOf(">Note<"));
		expect(note).not.toContain("aria-sort");
		expect(note).not.toContain("<button");
	});

	test("aligns numbers right and hides the columns that do not fit a phone", () => {
		const out = html();
		expect(out).toMatch(/<th[^>]*class="[^"]*text-right/);
		expect(out).toMatch(/<th[^>]*class="[^"]*max-md:hidden[^"]*"[^>]*>Note/);
		expect(out).toMatch(/<td[^>]*class="[^"]*max-md:hidden[^"]*"[^>]*>first/);
	});

	test("while the first page loads it shows placeholder rows, not data", () => {
		const out = html({ data: [], query: { isPending: true } });
		expect(out.match(/data-slot="skeleton"/g)).toHaveLength(8 * 3);
		expect(out).not.toContain("Nothing yet");
		expect(out).toContain('aria-busy="false"');
		expect(html({ query: { isFetching: true } })).toContain('aria-busy="true"');
	});

	test("the page being replaced stays, dimmed", () => {
		expect(html({ query: { isPlaceholderData: true } })).toContain(
			"opacity-60",
		);
		expect(html()).not.toContain("opacity-60");
	});

	test("with nothing at all it shows what the screen gave for that", () => {
		const out = html({ data: [], total: 0 });
		expect(out).toContain("Nothing yet");
		expect(out).not.toContain(m.admin_table_no_results_hint());
	});

	test("with filters on and nothing found it says so and offers to clear them", () => {
		const out = html({ data: [], total: 0, filtered: true });
		expect(out).toContain(m.admin_table_no_results_hint());
		expect(out).toContain(m.admin_table_clear_filters());
		expect(out).not.toContain("Nothing yet");
	});

	test("an error is announced with a retry, and shows no empty state", () => {
		const out = html({
			data: [],
			total: 0,
			query: { isError: true, error: new Error("boom") },
		});
		expect(out).toContain('role="alert"');
		expect(out).toContain(m.admin_table_retry());
		expect(out).not.toContain("Nothing yet");
	});
});

describe("TablePagination", () => {
	const page = (n: number) =>
		html({
			data: rows,
			total: 60,
			search: { page: n, pageSize: 25, sort: "code", dir: "asc" },
		});
	const button = (out: string, label: string) =>
		out.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

	test("says which rows it shows of the total and which page it is", () => {
		const out = page(2);
		expect(out).toContain(m.admin_table_range({ from: 26, to: 50, total: 60 }));
		expect(out).toContain(m.admin_table_page({ page: 2, pageCount: 3 }));
		expect(page(3)).toContain(
			m.admin_table_range({ from: 51, to: 60, total: 60 }),
		);
	});

	test("cannot go back from the first page nor forward from the last", () => {
		const first = page(1);
		expect(button(first, m.admin_table_first_page())).toContain('disabled=""');
		expect(button(first, m.admin_table_previous_page())).toContain(
			'disabled=""',
		);
		expect(button(first, m.admin_table_next_page())).not.toContain(
			'disabled=""',
		);
		const last = page(3);
		expect(button(last, m.admin_table_next_page())).toContain('disabled=""');
		expect(button(last, m.admin_table_last_page())).toContain('disabled=""');
		expect(button(last, m.admin_table_previous_page())).not.toContain(
			'disabled=""',
		);
	});

	test("offers the page sizes the API accepts, with the current one chosen", () => {
		const out = html({
			search: { page: 1, pageSize: 50, sort: "code", dir: "asc" },
		});
		for (const size of [10, 25, 50, 100])
			expect(out).toMatch(new RegExp(`<option[^>]*value="${size}"`));
		expect(out).toMatch(/<option[^>]*value="50"[^>]*selected/);
	});

	test("an empty list reads as no results on one page", () => {
		const out = html({ data: [], total: 0 });
		expect(out).toContain(m.admin_table_page({ page: 1, pageCount: 1 }));
		expect(out).not.toContain(
			m.admin_table_range({ from: 0, to: 0, total: 0 }),
		);
	});
});
