import { describe, expect, test } from "bun:test";
import { renderAdmin } from "#/test/admin-render";
import { CustomerForm } from "./edit-customer-dialog";
import type { AdminCustomer } from "./queries";

const customer = (
	over: Partial<AdminCustomer["customer"]> = {},
): AdminCustomer["customer"] => ({
	id: 1,
	name: "Ana Pérez",
	phoneE164: "+50371234567",
	email: "ana@example.com",
	notes: "Prefiere WhatsApp",
	createdAt: "2026-09-01T12:00:00Z",
	hasAccount: false,
	segment: "new",
	...over,
});

const render = (c: AdminCustomer["customer"]) =>
	renderAdmin(<CustomerForm customer={c} onClose={() => {}} />);

describe("CustomerForm", () => {
	test("shows the profile of the customer", () => {
		const html = render(customer());
		expect(html).toContain('name="name"');
		expect(html).toContain('value="Ana Pérez"');
		expect(html).toContain('value="+50371234567"');
		expect(html).toContain('type="email"');
		expect(html).toContain('value="ana@example.com"');
		expect(html).toContain("Prefiere WhatsApp");
	});

	test("a customer with no name, email or notes shows empty fields", () => {
		const html = render(customer({ name: null, email: null, notes: null }));
		for (const name of ["name", "email"])
			expect(
				new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0],
			).toContain('value=""');
		expect(html).not.toContain("ana@example.com");
		expect(html).not.toContain("Prefiere WhatsApp");
	});
});
