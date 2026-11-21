import { describe, expect, test } from "bun:test";
import { invoiceStatusLabel } from "#/components/admin/labels";
import { rows } from "#/components/admin/test-markup";
import { formatCalendarDate } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { renderAdminPage } from "#/test/admin-render";
import { InvoicesTable } from "./invoices-table";
import { type AdminInvoice, type InvoicePage, invoicesQuery } from "./queries";
import { invoiceSearchDefaults } from "./search";

const locale = intlLocale(getLocale(), "SV");
const money = (amount: number) => formatMoney(amount, "USD", locale);

const doc = (over: Partial<AdminInvoice> = {}): AdminInvoice => ({
	id: 3,
	orderId: 7,
	orderCode: "ECL-0007",
	dteType: "01",
	status: "sealed",
	controlNumber: "DTE-01-M001P001-000000000000003",
	generationCode: "6F1C2A7E-0000-4000-8000-000000000003",
	seal: "2026ABCDEF",
	issuedOn: "2026-10-30",
	total: 2400,
	expectedTotal: 2400,
	error: null,
	rejection: null,
	filed: true,
	customerLink: "https://eclalune.com/f/tok3",
	voidDeadline: "2027-01-30",
	voidReason: null,
	voidResponsible: null,
	voidedAt: null,
	createdAt: "2026-10-30T15:00:00Z",
	updatedAt: "2026-10-30T15:00:05Z",
	...over,
});

const page = (items: AdminInvoice[]): InvoicePage => ({
	items,
	total: items.length,
	page: 1,
	pageSize: 25,
	pageCount: 1,
});

const render = (data: InvoicePage, search = invoiceSearchDefaults) =>
	renderAdminPage(<InvoicesTable search={search} onSearchChange={() => {}} />, {
		queries: [[invoicesQuery(search).queryKey, data]],
	});

const queued = doc({
	id: 4,
	orderId: 9,
	orderCode: "ECL-0009",
	status: "queued",
	controlNumber: null,
	generationCode: null,
	seal: null,
	issuedOn: null,
	total: null,
	expectedTotal: 1800,
	error: "GreenerSys rate limit",
	filed: false,
	customerLink: null,
	voidDeadline: null,
});

describe("InvoicesTable", () => {
	test("draws a row per document: its order, status, control number, issue date and total", async () => {
		const html = await render(page([doc(), queued]));
		expect(html).toContain('href="/admin/orders/7"');
		expect(html).toContain('href="/admin/orders/9"');
		const [, sealed, waiting] = rows(html);
		expect(sealed).toContain("ECL-0007");
		expect(sealed).toContain(invoiceStatusLabel.sealed());
		expect(sealed).toContain("DTE-01-M001P001-000000000000003");
		expect(sealed).toContain(formatCalendarDate("2026-10-30", locale));
		expect(sealed).toContain(money(2400));
		// Not emitted yet: the total the order expects.
		expect(waiting).toContain(invoiceStatusLabel.queued());
		expect(waiting).toContain(money(1800));
	});

	test("marks the documents that have a problem, and only those", async () => {
		const html = await render(page([doc(), queued]));
		const [, sealed, waiting] = rows(html);
		expect(sealed.join(" ")).not.toContain(m.admin_invoice_has_problem());
		expect(waiting.join(" ")).toContain(m.admin_invoice_has_problem());
	});

	test("heads each column and is newest first by default", async () => {
		const html = await render(page([doc()]));
		for (const label of [
			m.admin_col_order(),
			m.admin_col_status(),
			m.admin_invoice_control_number(),
			m.admin_invoice_issued_on(),
			m.admin_col_total(),
			m.admin_invoice_col_created(),
			m.admin_invoice_col_problem(),
		])
			expect(html).toContain(label);
		const sorted = /<th[^>]*aria-sort="descending"[^>]*>.*?<\/th>/.exec(html);
		expect(sorted?.[0]).toContain(m.admin_invoice_col_created());
	});

	test("has a tab per status and a search by order code", async () => {
		const html = await render(page([doc()]));
		expect(html).toContain(m.admin_invoices_all());
		for (const label of Object.values(invoiceStatusLabel))
			expect(html).toContain(label());
		expect(html).toContain(m.admin_invoices_search());
	});

	test("an empty list says when invoices appear; a filter with no match offers to clear it", async () => {
		const empty = await render(page([]));
		expect(empty).toContain(m.admin_invoices_empty());
		expect(empty).toContain(m.admin_invoices_empty_hint());
		const none = await render(page([]), {
			...invoiceSearchDefaults,
			status: "rejected",
		});
		expect(none).toContain(m.admin_table_no_results());
		expect(none).toContain(m.admin_table_clear_filters());
		expect(none).not.toContain(m.admin_invoices_empty());
	});
});
