import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffAccessProvider } from "#/components/admin/staff-access";
import { categoryColumns } from "#/features/categories/columns";
import type { CategoryRow } from "#/features/categories/queries";
import { CATEGORY_SORTS } from "#/lib/schemas/categories";
import { m } from "#/paraglide/messages";
import { ArchivableTable } from "./archivable-table";
import type { ListQuery } from "./status-list";

const rows: CategoryRow[] = [
	{
		id: 1,
		slug: "teclados",
		name: "Teclados",
		sortOrder: 1,
		icon: "keyboard",
		status: "active",
		products: 7,
	},
	{
		id: 2,
		slug: "ratones",
		name: null,
		sortOrder: 2,
		icon: "mouse",
		status: "archived",
		products: 0,
	},
];

const query = (
	items: CategoryRow[],
	state: Partial<ListQuery<CategoryRow>> = {},
): ListQuery<CategoryRow> => ({
	data: {
		items,
		total: items.length,
		page: 1,
		pageSize: 25,
		pageCount: 1,
	},
	isPending: false,
	isError: false,
	error: null,
	isPlaceholderData: false,
	isFetching: false,
	refetch: () => Promise.reject(new Error("not used")),
	...state,
});

const html = (
	items: CategoryRow[],
	search: {
		status?: "active" | "archived";
		q?: string;
		sort?: (typeof CATEGORY_SORTS)[number];
	} = {},
) =>
	renderToStaticMarkup(
		<StaffAccessProvider user={{ role: "admin" }}>
			<ArchivableTable
				query={query(items)}
				search={{
					page: 1,
					pageSize: 25,
					sort: search.sort ?? "sortOrder",
					dir: "asc",
					q: search.q,
					status: search.status,
				}}
				onSearchChange={() => {}}
				sorts={CATEGORY_SORTS}
				columns={categoryColumns}
				onStatus={() => {}}
				Dialog={() => <p>the dialog</p>}
				newLabel="New category"
				searchLabel="Search categories"
				emptyTitle="No categories"
				emptyHint="Create the first one"
			/>
		</StaffAccessProvider>,
	);

describe("ArchivableTable", () => {
	test("lists each row with its name, slug, own column, product count and status", () => {
		const out = html(rows);
		expect(out).toContain("Teclados");
		expect(out).toContain("teclados");
		expect(out).toContain(">7<");
		expect(out).toContain(m.admin_merch_status_active());
		expect(out).toContain(m.admin_merch_status_archived());
		expect(out).toContain(m.admin_category_sort_order());
	});

	test("a row without a name in the main language says so", () => {
		expect(html(rows)).toContain(m.admin_merch_no_name());
		expect(html([rows[0] as CategoryRow])).not.toContain(
			m.admin_merch_no_name(),
		);
	});

	test("each row's actions button says whose it is, by name or by slug", () => {
		const out = html(rows);
		expect(out).toContain(
			`aria-label="${m.admin_merch_row_actions({ name: "Teclados" })}"`,
		);
		expect(out).toContain(
			`aria-label="${m.admin_merch_row_actions({ name: "ratones" })}"`,
		);
	});

	test("has a tab per status with all first, and the chosen one is selected", () => {
		const out = html(rows, { status: "archived" });
		const tabs = [
			...out.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g),
		];
		expect(tabs.map((t) => t[1])).toEqual([
			m.admin_merch_all(),
			m.admin_merch_status_active(),
			m.admin_merch_status_archived(),
		]);
		expect(tabs.map((t) => /aria-selected="true"/.test(t[0]))).toEqual([
			false,
			false,
			true,
		]);
		expect([
			...html(rows).matchAll(/role="tab"[^>]*aria-selected="true"/g),
		]).toHaveLength(1);
	});

	test("marks the column it is sorted by", () => {
		expect(html(rows, { sort: "name" })).toMatch(
			new RegExp(
				`<th[^>]*aria-sort="ascending"[^>]*>.*?${m.admin_field_name()}`,
			),
		);
		expect(html(rows)).toMatch(
			new RegExp(
				`<th[^>]*aria-sort="ascending"[^>]*>.*?${m.admin_category_sort_order()}`,
			),
		);
	});

	test("with no rows and no filter it offers to create the first one", () => {
		const out = html([]);
		expect(out).toContain("No categories");
		expect(out).toContain("Create the first one");
		// In the toolbar and in the empty state.
		expect(out.match(/New category/g)).toHaveLength(2);
	});

	test("with no rows under a status tab it says nothing matches too", () => {
		const out = html([], { status: "archived" });
		expect(out).toContain(m.admin_table_no_results());
		expect(out).not.toContain("No categories");
	});

	test("with no rows under a search it says nothing matches, and offers to clear it", () => {
		const out = html([], { q: "zzz" });
		expect(out).toContain(m.admin_table_no_results());
		expect(out).toContain(m.admin_table_clear_filters());
		expect(out).not.toContain("No categories");
	});

	test("shows the search text it was given and no dialog until one is opened", () => {
		const out = html(rows, { q: "teclados" });
		expect(out).toMatch(/<input[^>]*type="search"[^>]*value="teclados"/);
		expect(out).not.toContain("the dialog");
	});
});
