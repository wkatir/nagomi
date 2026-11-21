import { describe, expect, test } from "bun:test";
import type { AdminOrder } from "#/lib/api";
import { formatCalendarDate } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { renderAdmin } from "#/test/admin-render";
import {
	IssueInvoiceForm,
	type IssueValues,
	issueSchema,
	receptorOf,
} from "./issue-invoice-dialog";
import type { AdminInvoice } from "./queries";
import { VoidInvoiceForm, voidSchema } from "./void-invoice-dialog";

const finalConsumer: IssueValues = {
	inName: false,
	nombre: "",
	tipoDocumento: "",
	numeroDocumento: "",
	correo: "",
};

const refusals = (values: Partial<IssueValues>): [string, string][] => {
	const result = issueSchema.safeParse({ ...finalConsumer, ...values });
	return result.success
		? []
		: result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("issueSchema", () => {
	test("for a final consumer nothing is asked, whatever the hidden fields hold", () => {
		expect(refusals({})).toEqual([]);
		expect(refusals({ numeroDocumento: "123", correo: "nope" })).toEqual([]);
	});

	test("in the customer's name, the name is required", () => {
		expect(refusals({ inName: true, nombre: "  " })).toEqual([
			["nombre", m.admin_required()],
		]);
		expect(refusals({ inName: true, nombre: "Ana" })).toEqual([]);
	});

	test("a document type and its number go together", () => {
		const named = { inName: true, nombre: "Ana" };
		expect(refusals({ ...named, tipoDocumento: "13" })).toEqual([
			["numeroDocumento", m.admin_invoice_doc_number_required()],
		]);
		expect(refusals({ ...named, numeroDocumento: "01234567-8" })).toEqual([
			["tipoDocumento", m.admin_invoice_doc_type_required()],
		]);
		expect(
			refusals({ ...named, tipoDocumento: "36", numeroDocumento: "06140101" }),
		).toEqual([]);
	});

	test("an email, when given, is one", () => {
		const named = { inName: true, nombre: "Ana" };
		expect(refusals({ ...named, correo: "ana@" })).toEqual([
			["correo", m.admin_customer_email_invalid()],
		]);
		expect(refusals({ ...named, correo: "ana@example.com" })).toEqual([]);
	});
});

describe("receptorOf", () => {
	test("a final consumer sends no buyer", () => {
		expect(
			receptorOf({ ...finalConsumer, nombre: "Ana", correo: "a@b.co" }),
		).toBeUndefined();
	});

	test("in the customer's name it sends what was given and nothing empty", () => {
		const named = { ...finalConsumer, inName: true, nombre: "Ana" };
		expect(receptorOf(named)).toEqual({ nombre: "Ana" });
		expect(
			receptorOf({
				...named,
				tipoDocumento: "13",
				numeroDocumento: "01234567-8",
				correo: "ana@example.com",
			}),
		).toEqual({
			nombre: "Ana",
			tipoDocumento: "13",
			numeroDocumento: "01234567-8",
			correo: "ana@example.com",
		});
	});
});

describe("IssueInvoiceForm", () => {
	const order = {
		id: 7,
		code: "ECL-0007",
		customerName: "Ana Pérez",
		customerEmail: null,
	} as unknown as AdminOrder["order"];

	test("starts for a final consumer: the switch, the note on asking for an ID, and no buyer fields", () => {
		const html = renderAdmin(
			<IssueInvoiceForm order={order} onClose={() => {}} />,
		);
		expect(html).toContain('role="switch"');
		expect(html).toContain('aria-checked="false"');
		expect(html).toContain(m.admin_invoice_in_name());
		expect(html).toContain(m.admin_invoice_in_name_note());
		for (const name of ["nombre", "tipoDocumento", "numeroDocumento", "correo"])
			expect(html).not.toContain(`name="${name}"`);
		expect(html).toContain(m.admin_invoice_issue());
	});
});

describe("voidSchema", () => {
	const valid = {
		reason: "Pedido devuelto",
		name: "Wilmer Salazar",
		documentType: "13",
		documentNumber: "01234567-8",
	};
	const refused = (values: object) => {
		const result = voidSchema().safeParse({ ...valid, ...values });
		return result.success
			? []
			: result.error.issues.map((i) => [i.path.join("."), i.message]);
	};

	test("takes a reason of 5 to 200 characters and the person who voids", () => {
		expect(refused({})).toEqual([]);
		expect(refused({ reason: " abcd " })).toEqual([
			["reason", m.admin_invoice_void_reason_length()],
		]);
		expect(refused({ reason: "x".repeat(201) })).toEqual([
			["reason", m.admin_invoice_void_reason_length()],
		]);
		expect(refused({ reason: "x".repeat(200) })).toEqual([]);
		expect(refused({ name: " ", documentNumber: "" })).toEqual([
			["name", m.admin_required()],
			["documentNumber", m.admin_required()],
		]);
		expect(refused({ documentType: "02" }).map(([field]) => field)).toEqual([
			"documentType",
		]);
	});
});

describe("VoidInvoiceForm", () => {
	const doc = {
		id: 3,
		orderId: 7,
		orderCode: "ECL-0007",
		voidDeadline: "2027-01-30",
	} as unknown as AdminInvoice & { voidDeadline: string };

	test("asks for the reason and the real person, shows the deadline and voids as a destructive action", () => {
		const html = renderAdmin(<VoidInvoiceForm doc={doc} onClose={() => {}} />);
		for (const name of ["reason", "name", "documentType", "documentNumber"])
			expect(html).toContain(`name="${name}"`);
		expect(html).toContain(m.admin_invoice_void_effect());
		expect(html).toContain(m.admin_invoice_void_responsible_note());
		expect(html).toContain(
			m.admin_invoice_void_until({
				date: formatCalendarDate("2027-01-30", intlLocale(getLocale(), "SV")),
			}),
		);
		const submit = /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0];
		expect(submit).toContain('data-variant="destructive"');
	});
});
