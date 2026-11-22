import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderAdminPage } from "#/test/admin-render";
import { CustomersTable } from "./customers-table";
import { type AdminCustomers, customersQuery } from "./queries";
import { customerSearchDefaults } from "./search";

type Row = AdminCustomers["items"][number];

const row = (over: Partial<Row>): Row => ({
	id: 1,
	name: "Ana Pérez",
	phoneE164: "+50371234567",
	email: "ana@example.com",
	notes: null,
	createdAt: "2026-09-01T12:00:00Z",
	hasAccount: false,
	segment: "occasional",
	orders: 2,
	lifetimeValue: 4200,
	netPaid: 3200,
	balance: 1000,
	firstOrderAt: "2026-10-01T12:00:00Z",
	lastOrderAt: "2026-10-10T12:00:00Z",
	...over,
});

const page = (items: Row[], total = items.length): AdminCustomers => ({
	items,
	total,
	page: 1,
	pageSize: 25,
	pageCount: 1,
});

const render = (data: AdminCustomers, search = customerSearchDefaults) =>
	renderAdminPage(
		<CustomersTable search={search} onSearchChange={() => {}} />,
		{
			queries: [[customersQuery(search).queryKey, data]],
		},
	);

describe("CustomersTable", () => {
	test("draws a row per customer, linked to their page, with what they spent", async () => {
		const html = await render(
			page([
				row({}),
				row({
					id: 2,
					name: null,
					phoneE164: "+50372345678",
					email: null,
					orders: 0,
					lifetimeValue: 0,
					firstOrderAt: null,
					lastOrderAt: null,
				}),
			]),
		);
		expect(html).toContain('href="/admin/customers/1"');
		expect(html).toContain('href="/admin/customers/2"');
		expect(html).toContain("Ana Pérez");
		expect(html).toContain("+50371234567 · ana@example.com");
		expect(html).toContain("$42.00");
		expect(html).toContain(">+50372345678</a>");
		expect(html).not.toContain("+50372345678 ·");
		expect(html).toContain(m.admin_customer_no_orders());
		expect(html).toContain(m.admin_table_range({ from: 1, to: 2, total: 2 }));
	});

	test("heads each column with its name and marks the sort in use", async () => {
		const html = await render(page([row({})]));
		for (const label of [
			m.admin_col_customer(),
			m.admin_customer_col_orders(),
			m.admin_customer_col_spent(),
			m.admin_customer_col_last_order(),
			m.admin_customer_col_since(),
		])
			expect(html).toContain(label);
		expect(html.match(/aria-sort="descending"/g)).toHaveLength(1);
		const sorted = /<th[^>]*aria-sort="descending"[^>]*>.*?<\/th>/.exec(html);
		expect(sorted?.[0]).toContain(m.admin_customer_col_since());
	});

	test("offers the CSV of the customers the search shows, and no way to add one", async () => {
		const html = await render(page([row({})]));
		expect(html).toContain('href="/api/admin/exports/customers.csv"');
		const searched = await render(page([row({})]), {
			...customerSearchDefaults,
			q: "ana",
		});
		expect(searched).toContain('href="/api/admin/exports/customers.csv?q=ana"');
		expect(html).not.toContain(m.admin_orders_new());
	});

	test("says there are no customers yet, or none for the search", async () => {
		const empty = await render(page([]));
		expect(empty).toContain(m.admin_customer_empty());
		expect(empty).toContain(m.admin_customer_empty_hint());
		const none = await render(page([]), {
			...customerSearchDefaults,
			q: "zzz",
		});
		expect(none).toContain(m.admin_table_no_results());
		expect(none).toContain(m.admin_table_clear_filters());
		expect(none).not.toContain(m.admin_customer_empty());
	});
});
