import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { customerLabel } from "./columns";
import { contactsOf } from "./customer-detail";

describe("contactsOf", () => {
	test("WhatsApp comes first, then a call, then an email", () => {
		expect(
			contactsOf({ phoneE164: "+50371234567", email: "ana@example.com" }),
		).toEqual([
			{
				key: "whatsapp",
				label: m.admin_customer_whatsapp(),
				href: "https://wa.me/50371234567?text=",
				external: true,
			},
			{
				key: "call",
				label: m.admin_customer_call(),
				href: "tel:+50371234567",
				external: false,
			},
			{
				key: "email",
				label: m.admin_customer_email_action(),
				href: "mailto:ana@example.com",
				external: false,
			},
		]);
	});

	test("a customer with only a phone has no email, and one with only an email has no call", () => {
		expect(
			contactsOf({ phoneE164: "+50371234567", email: null }).map((c) => c.key),
		).toEqual(["whatsapp", "call"]);
		expect(
			contactsOf({ phoneE164: null, email: "ana@example.com" }).map(
				(c) => c.key,
			),
		).toEqual(["email"]);
		expect(contactsOf({ phoneE164: null, email: null })).toEqual([]);
	});
});

describe("customerLabel", () => {
	test("is the name, else the phone, else that there is no name", () => {
		expect(customerLabel({ name: "Ana", phoneE164: "+50371234567" })).toBe(
			"Ana",
		);
		expect(customerLabel({ name: null, phoneE164: "+50371234567" })).toBe(
			"+50371234567",
		);
		expect(customerLabel({ name: null, phoneE164: null })).toBe(
			m.admin_customer_no_name(),
		);
	});
});
