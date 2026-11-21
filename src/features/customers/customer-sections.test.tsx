import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderAdmin } from "#/test/admin-render";
import {
	CustomerConsents,
	CustomerProfile,
	CustomerSummary,
} from "./customer-sections";
import type { AdminCustomer } from "./queries";

const detail = (over: Partial<AdminCustomer> = {}): AdminCustomer => ({
	customer: {
		id: 1,
		name: "Ana Pérez",
		phoneE164: "+50371234567",
		email: "ana@example.com",
		notes: "Prefiere WhatsApp",
		createdAt: "2026-09-01T12:00:00Z",
	},
	totals: {
		orders: 2,
		lifetimeValue: 4200,
		netPaid: 3200,
		balance: 1000,
		firstOrderAt: "2026-10-01T12:00:00Z",
		lastOrderAt: "2026-10-10T12:00:00Z",
	},
	consents: [],
	consentHistory: [],
	orders: [],
	...over,
});

const consent = (
	over: Partial<AdminCustomer["consentHistory"][number]> = {},
): AdminCustomer["consentHistory"][number] => ({
	id: 1,
	orderId: null,
	purpose: "marketing_whatsapp",
	granted: true,
	channel: "web",
	recordedAt: "2026-10-02T15:30:00Z",
	page: "privacy",
	locale: "es",
	version: 1,
	...over,
});

describe("CustomerSummary", () => {
	test("says how many orders, what they owe, what they paid and the balance", () => {
		const html = renderAdmin(<CustomerSummary detail={detail()} />);
		for (const label of [
			m.admin_customer_summary(),
			m.admin_customer_col_orders(),
			m.admin_customer_col_spent(),
			m.admin_customer_net_paid(),
			m.admin_customer_balance(),
			m.admin_customer_first_order(),
			m.admin_customer_col_last_order(),
		])
			expect(html).toContain(label);
		expect(html).toContain("$42.00");
		expect(html).toContain("$32.00");
		expect(html).toContain("$10.00");
		expect(html).toContain("2026");
	});

	test("a customer who never ordered has zeros and no dates", () => {
		const html = renderAdmin(
			<CustomerSummary
				detail={detail({
					totals: {
						orders: 0,
						lifetimeValue: 0,
						netPaid: 0,
						balance: 0,
						firstOrderAt: null,
						lastOrderAt: null,
					},
				})}
			/>,
		);
		expect(html).toContain("$0.00");
		expect(html).not.toContain(m.admin_customer_first_order());
		expect(html).not.toContain(m.admin_customer_col_last_order());
	});
});

describe("CustomerProfile", () => {
	test("shows what the store has and the action that edits it", () => {
		const html = renderAdmin(
			<CustomerProfile detail={detail()} action={<i>edit-here</i>} />,
		);
		for (const text of [
			"Ana Pérez",
			"+50371234567",
			"ana@example.com",
			"Prefiere WhatsApp",
			"edit-here",
			m.admin_field_email(),
			m.admin_order_notes(),
		])
			expect(html).toContain(text);
	});

	test("leaves out what the store does not have", () => {
		const html = renderAdmin(
			<CustomerProfile
				detail={detail({
					customer: {
						...detail().customer,
						name: null,
						email: null,
						notes: null,
					},
				})}
				action={null}
			/>,
		);
		expect(html).toContain("+50371234567");
		expect(html).not.toContain(m.admin_order_customer_name());
		expect(html).not.toContain(m.admin_field_email());
		expect(html).not.toContain(m.admin_order_notes());
	});
});

describe("CustomerConsents", () => {
	test("says there is nothing recorded", () => {
		const html = renderAdmin(<CustomerConsents detail={detail()} />);
		expect(html).toContain(m.admin_customer_consents_empty());
		expect(html).not.toContain(m.admin_customer_consent_history());
	});

	test("shows the current choice of each purpose and folds the history away", () => {
		const html = renderAdmin(
			<CustomerConsents
				detail={detail({
					consents: [
						consent({ id: 3, granted: false }),
						consent({ id: 2, purpose: "terms", granted: true }),
					],
					consentHistory: [
						consent({ id: 3, granted: false, channel: "whatsapp" }),
						consent({ id: 2, purpose: "terms" }),
						consent({ id: 1 }),
					],
				})}
			/>,
		);
		expect(html).toContain(m.admin_customer_consent_history());
		expect(html).toContain(m.admin_consent_marketing_whatsapp());
		expect(html).toContain(m.admin_consent_terms());
		expect(html).toContain(m.admin_consent_revoked());
		expect(html).toContain(m.admin_consent_granted());
		// The history says where each change was given; the Accordion keeps it closed.
		expect(html).toContain('data-state="closed"');
	});
});
