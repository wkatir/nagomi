import { describe, expect, test } from "bun:test";
import { createColumnHelper } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import {
	type ListFeatures,
	type ListSearch,
	useDataTable,
} from "./use-data-table";

type Row = { id: number; code: string; total: number };
const column = createColumnHelper<ListFeatures, Row>();
const columns = column.columns([
	column.accessor("code", { header: "Code" }),
	column.accessor("total", { header: "Total" }),
	column.display({ id: "other", header: "Other", enableSorting: true }),
]);
const SORTS = ["code", "total"] as const;
type Sort = (typeof SORTS)[number];

function reported(
	act: (table: ReturnType<typeof useTableOf>) => void,
	search: ListSearch<Sort> = {
		page: 2,
		pageSize: 25,
		sort: "code",
		dir: "asc",
	},
) {
	const changes: Partial<ListSearch<Sort>>[] = [];
	function useTableOf() {
		return useDataTable({
			data: [] as Row[],
			columns,
			rowCount: 120,
			search,
			sorts: SORTS,
			onSearchChange: (change) => changes.push(change),
			getRowId: (row) => String(row.id),
		});
	}
	function Harness() {
		act(useTableOf());
		return null;
	}
	renderToStaticMarkup(<Harness />);
	return changes;
}

describe("useDataTable", () => {
	test("shows the page, size and sort of the search", () => {
		let state: unknown;
		reported(
			(table) => {
				state = table.state;
			},
			{ page: 3, pageSize: 50, sort: "total", dir: "desc" },
		);
		expect(state).toMatchObject({
			pagination: { pageIndex: 2, pageSize: 50 },
			sorting: [{ id: "total", desc: true }],
		});
	});

	test("moving between pages reports only the page", () => {
		expect(reported((table) => table.nextPage())).toEqual([{ page: 3 }]);
		expect(reported((table) => table.previousPage())).toEqual([{ page: 1 }]);
		expect(reported((table) => table.setPageIndex(4))).toEqual([{ page: 5 }]);
		expect(reported((table) => table.firstPage())).toEqual([{ page: 1 }]);
		expect(reported((table) => table.lastPage())).toEqual([{ page: 5 }]);
	});

	test("a new page size goes back to the first page", () => {
		expect(reported((table) => table.setPageSize(100))).toEqual([
			{ page: 1, pageSize: 100 },
		]);
	});

	test("refuses a page size the API does not accept", () => {
		expect(() => reported((table) => table.setPageSize(7))).toThrow(
			"Unsupported page size 7",
		);
	});

	test("a new sort goes back to the first page, in the direction asked", () => {
		expect(
			reported((table) => table.getColumn("total")?.toggleSorting(true)),
		).toEqual([{ page: 1, sort: "total", dir: "desc" }]);
		expect(
			reported((table) => table.getColumn("total")?.toggleSorting(false)),
		).toEqual([{ page: 1, sort: "total", dir: "asc" }]);
	});

	test("clicking the sorted column again reverses it and never leaves the list unsorted", () => {
		expect(
			reported((table) => table.getColumn("code")?.toggleSorting()),
		).toEqual([{ page: 1, sort: "code", dir: "desc" }]);
		expect(
			reported((table) => table.getColumn("code")?.toggleSorting(), {
				page: 2,
				pageSize: 25,
				sort: "code",
				dir: "desc",
			}),
		).toEqual([{ page: 1, sort: "code", dir: "asc" }]);
	});

	test("refuses a sort the list does not offer", () => {
		expect(() =>
			reported((table) => table.getColumn("other")?.toggleSorting(false)),
		).toThrow("Unsupported sort other");
	});
});
