import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { facts } from "#/components/admin/test-markup";
import type { AdminOrder } from "#/lib/api";
import { formatCalendarDate } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { renderAdmin } from "#/test/admin-render";
import { OrderInvoice } from "./invoice-card";
import {
	type AdminInvoice,
	type InvoiceAttention,
	invoiceAttentionQuery,
	orderInvoicesQuery,
} from "./queries";

afterEach(() => setSystemTime());

const locale = intlLocale(getLocale(), "SV");
const money = (amount: number) => formatMoney(amount, "USD", locale);
const day = (date: string) => formatCalendarDate(date, locale);

const order = (over: Partial<AdminOrder["order"]> = {}) =>
	({
		id: 7,
		code: "ECL-0007",
		status: "delivered",
		paymentMethod: "cash",
		customerName: "Ana Pérez",
		customerEmail: null,
		locale: "es",
		...over,
	}) as unknown as AdminOrder["order"];

const doc = (over: Partial<AdminInvoice> = {}): AdminInvoice => ({
	id: 3,
	orderId: 7,
	orderCode: "ECL-0007",
	dteType: "01",
	status: "sealed",
	controlNumber: "DTE-01-M001P001-000000000000003",
	generationCode: "6F1C2A7E-0000-4000-8000-000000000003",
	seal: "2026ABCDEF0123456789ABCDEF0123456789ABCD",
	issuedOn: "2026-10-30",
	total: 2400,
	expectedTotal: 2400,
	error: null,
	rejection: null,
	filed: true,
	customerLink: "https://eclalune.com/f/tok3",
	voidDeadline: "2099-01-30",
	voidReason: null,
	voidResponsible: null,
	voidedAt: null,
	createdAt: "2026-10-30T15:00:00Z",
	updatedAt: "2026-10-30T15:00:05Z",
	...over,
});

const attention = (configured = true): InvoiceAttention => ({
	configured,
	refused: 0,
	waiting: 0,
	stuck: 0,
});

const render = (
	docs: AdminInvoice[],
	{
		of = order(),
		configured = true,
	}: { of?: AdminOrder["order"]; configured?: boolean } = {},
) =>
	renderAdmin(<OrderInvoice order={of} />, {
		queries: [
			[
				orderInvoicesQuery(of.id).queryKey,
				{
					items: docs,
					total: docs.length,
					page: 1,
					pageSize: 100,
					pageCount: 1,
				},
			],
			[invoiceAttentionQuery.queryKey, attention(configured)],
		],
	});

const button = (html: string, label: string) =>
	html.includes(`>${label}</button>`);

describe("OrderInvoice", () => {
	test("an order with no document says so, explains when one is issued and offers to issue it", () => {
		const html = render([]);
		expect(html).toContain(m.admin_invoice_card());
		expect(html).toContain(m.admin_invoice_none());
		expect(html).toContain(m.admin_invoice_when());
		expect(button(html, m.admin_invoice_issue())).toBe(true);
		expect(html).not.toContain(m.admin_invoice_not_configured());
	});

	test("only a booked order with its payment method fixed can be issued by hand", () => {
		for (const status of ["pending", "cancelled"] as const)
			expect(
				button(render([], { of: order({ status }) }), m.admin_invoice_issue()),
			).toBe(false);
		expect(
			button(
				render([], { of: order({ status: "confirmed", paymentMethod: null }) }),
				m.admin_invoice_issue(),
			),
		).toBe(false);
		for (const status of ["confirmed", "fulfilled"] as const)
			expect(
				button(render([], { of: order({ status }) }), m.admin_invoice_issue()),
			).toBe(true);
		// A cancelled order will never be invoiced, so it is not told when it would be.
		expect(render([], { of: order({ status: "cancelled" }) })).not.toContain(
			m.admin_invoice_when(),
		);
	});

	test("without invoicing set up it says so briefly and offers nothing to do", () => {
		const html = render([], { configured: false });
		expect(html).toContain(m.admin_invoice_not_configured());
		expect(html).not.toContain(m.admin_invoice_none());
		expect(html).not.toContain("<button");
	});

	test("a sealed document shows its numbers, its files, the message for the customer and until when it can be voided", () => {
		const html = render([doc()]);
		expect(facts(html)).toEqual([
			[m.admin_col_status(), m.admin_invoice_status_sealed()],
			[m.admin_invoice_control_number(), "DTE-01-M001P001-000000000000003"],
			[
				m.admin_invoice_generation_code(),
				"6F1C2A7E-0000-4000-8000-000000000003",
			],
			[m.admin_invoice_seal(), "2026ABCDEF0123456789ABCDEF0123456789ABCD"],
			[m.admin_invoice_issued_on(), day("2026-10-30")],
			[m.admin_col_total(), money(2400)],
		]);
		expect(html).toContain('href="/api/admin/invoices/3/pdf" download=""');
		expect(html).toContain('href="/api/admin/invoices/3/json" download=""');
		expect(html).toContain(m.admin_order_copy_message());
		expect(html).toContain(
			m.admin_invoice_void_until({ date: day("2099-01-30") }),
		);
		expect(button(html, m.admin_invoice_void())).toBe(true);
		// It is live: no second one, and nothing to ask the provider.
		expect(button(html, m.admin_invoice_issue())).toBe(false);
		expect(button(html, m.admin_invoice_check())).toBe(false);
		expect(html).not.toContain('role="alert"');
	});

	test("it can be voided through the last day of its deadline in the store's time zone", () => {
		const deadline = { voidDeadline: "2027-01-30" };
		// 23:00 on January 30 in El Salvador.
		setSystemTime(new Date("2027-01-31T05:00:00Z"));
		const lastDay = render([doc(deadline)]);
		expect(button(lastDay, m.admin_invoice_void())).toBe(true);
		expect(lastDay).toContain(
			m.admin_invoice_void_until({ date: day("2027-01-30") }),
		);
		// Midnight: January 31 there.
		setSystemTime(new Date("2027-01-31T06:00:00Z"));
		const late = render([doc(deadline)]);
		expect(button(late, m.admin_invoice_void())).toBe(false);
		expect(late).toContain(
			m.admin_invoice_void_closed({ date: day("2027-01-30") }),
		);
	});

	test("a void already asked for waits for Hacienda instead of offering another", () => {
		const html = render([doc({ voidReason: "Pedido devuelto" })]);
		expect(html).toContain(
			m.admin_invoice_void_requested({ reason: "Pedido devuelto" }),
		);
		expect(button(html, m.admin_invoice_void())).toBe(false);
	});

	test("without invoicing set up a sealed document keeps its files but cannot be voided", () => {
		const html = render([doc()], { configured: false });
		expect(html).toContain('href="/api/admin/invoices/3/pdf"');
		expect(button(html, m.admin_invoice_void())).toBe(false);
		expect(html).toContain(
			m.admin_invoice_void_until({ date: day("2099-01-30") }),
		);
	});

	test("a rejected document says what Hacienda found and what to do, and a new one can be issued", () => {
		const html = render([
			doc({
				id: 4,
				status: "rejected",
				seal: null,
				total: null,
				filed: false,
				customerLink: null,
				voidDeadline: null,
				rejection: [
					{
						problema: "El NIT del receptor no existe",
						accion: "Corrige el NIT",
						donde: "receptor.nit",
					},
				],
			}),
		]);
		expect(html).toContain(m.admin_invoice_status_rejected());
		expect(html).toContain('role="alert"');
		expect(html).toContain(m.admin_invoice_rejected_title());
		expect(html).toContain("El NIT del receptor no existe (receptor.nit)");
		expect(html).toContain(
			m.admin_invoice_rejection_action({ action: "Corrige el NIT" }),
		);
		expect(button(html, m.admin_invoice_issue())).toBe(true);
		expect(html).not.toContain("/api/admin/invoices/4/pdf");
		expect(html).not.toContain(m.admin_order_copy_message());
	});

	test("a document still processing can be asked about and has no files yet", () => {
		const html = render([
			doc({
				status: "processing",
				seal: null,
				filed: false,
				customerLink: null,
				voidDeadline: null,
			}),
		]);
		expect(html).toContain(m.admin_invoice_status_processing());
		expect(button(html, m.admin_invoice_check())).toBe(true);
		expect(button(html, m.admin_invoice_issue())).toBe(false);
		expect(html).not.toContain("/api/admin/invoices/3/pdf");
		expect(html).not.toContain(m.admin_invoice_seal());
		// Before the provider answers, the total is the one the order expects.
		const queued = render([
			doc({ status: "queued", total: null, expectedTotal: 1800, seal: null }),
		]);
		expect(facts(queued)).toContainEqual([m.admin_col_total(), money(1800)]);
	});

	test("a document waiting to be sent says why", () => {
		const html = render([
			doc({
				status: "queued",
				seal: null,
				filed: false,
				customerLink: null,
				voidDeadline: null,
				error: "GreenerSys rate limit",
			}),
		]);
		expect(html).toContain(m.admin_invoice_waiting_title());
		expect(html).toContain("GreenerSys rate limit");
		expect(button(html, m.admin_invoice_check())).toBe(true);
	});

	test("a sealed total that is not the order's is said with both amounts", () => {
		const html = render([
			doc({
				total: 2300,
				error: "total_mismatch: expected 2400, provider 2300",
			}),
		]);
		expect(html).toContain(m.admin_invoice_problem_title());
		expect(html).toContain(
			m.admin_invoice_total_mismatch({
				total: money(2300),
				expected: money(2400),
			}),
		);
		expect(html).not.toContain("total_mismatch");
	});

	test("earlier documents are folded away in the history", () => {
		const failed = doc({
			id: 2,
			status: "failed",
			error: "receptor.correo invalid",
			filed: false,
		});
		expect(render([doc()])).not.toContain(m.admin_invoice_history());
		const html = render([doc(), failed]);
		expect(html).toContain(m.admin_invoice_history());
		// The current one is the newest: the earlier failure is not its problem.
		expect(html).not.toContain(m.admin_invoice_failed_title());
	});
});
