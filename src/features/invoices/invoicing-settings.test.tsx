import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { facts } from "#/components/admin/test-markup";
import { m } from "#/paraglide/messages";
import { InvoicingSettings } from "./invoicing-settings";
import type { InvoiceConnection } from "./queries";

const render = (connection: InvoiceConnection) =>
	renderToStaticMarkup(<InvoicingSettings connection={connection} />);

describe("InvoicingSettings", () => {
	test("a working connection shows the server and the document types Hacienda enabled", () => {
		const html = render({
			configured: true,
			host: "eclalune.greenersys.com",
			types: [
				{ codigo: "01", nombre: "Factura", habilitado: true },
				{
					codigo: "03",
					nombre: "Comprobante de crédito fiscal",
					habilitado: false,
				},
			],
			error: null,
		});
		const [state, host, types] = facts(html);
		expect(state).toEqual([
			m.admin_invoicing_state(),
			m.admin_invoicing_configured(),
		]);
		expect(host).toEqual([m.admin_invoicing_host(), "eclalune.greenersys.com"]);
		expect(types).toEqual([
			m.admin_invoicing_types(),
			[
				"01 Factura",
				m.admin_invoicing_type_enabled(),
				"03 Comprobante de crédito fiscal",
				m.admin_invoicing_type_disabled(),
			].join(" | "),
		]);
		expect(html).not.toContain('role="alert"');
	});

	test("not set up: says so, with no server or types", () => {
		const html = render({
			configured: false,
			host: null,
			types: [],
			error: null,
		});
		expect(facts(html)).toEqual([
			[m.admin_invoicing_state(), m.admin_invoicing_not_configured()],
		]);
	});

	test("a provider that refuses shows its answer instead of the types", () => {
		const html = render({
			configured: true,
			host: "eclalune.greenersys.com",
			types: [],
			error: "Invalid API key",
		});
		expect(html).toContain('role="alert"');
		expect(html).toContain(
			m.admin_invoicing_error({ message: "Invalid API key" }),
		);
		expect(html).not.toContain(m.admin_invoicing_types());
		expect(html).not.toContain(m.admin_invoicing_no_types());
	});

	test("always says when invoices are issued and where the key lives", () => {
		for (const html of [
			render({ configured: false, host: null, types: [], error: null }),
			render({ configured: true, host: "h", types: [], error: null }),
		]) {
			expect(html).toContain(m.admin_invoicing_when());
			expect(html).toContain(m.admin_invoicing_secret());
		}
	});
});
