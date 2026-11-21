import { describe, expect, test } from "bun:test";
import catalog from "../../../seed/catalog.json";
import {
	type InvoiceLine,
	type InvoiceOrder,
	invoiceKey,
	invoiceRequest,
	minorUnits,
	statusFromProvider,
	voidDeadline,
} from "./invoicing";

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
	sku: "OIL-200",
	brandName: "SKIN1004",
	productName: "Cleansing Oil",
	sizeValue: 200,
	sizeUnit: "ml",
	quantity: 1,
	unitPrice: 2400,
	returned: 0,
	...over,
});

const order = (over: Partial<InvoiceOrder> = {}): InvoiceOrder => {
	const lines = over.lines ?? [line()];
	const subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
	return {
		status: "confirmed",
		subtotal,
		discount: 0,
		shipping: 0,
		paymentMethod: "bank_transfer",
		lines,
		...over,
	};
};

const build = (o: InvoiceOrder, options = {}) =>
	invoiceRequest(o, { locale: "es", ...options });

// What the provider charges for a line: the net price with IVA, rounded to the cent.
const charged = (net: number, units: number) =>
	Math.round(net * 1.13 * units * 100);

describe("invoiceRequest", () => {
	test("sends each line net of IVA with our SKU and a readable description", () => {
		const { body, expectedTotal } = build(order());
		expect(body).toEqual({
			tipoDte: "01",
			items: [
				{
					codigo: "OIL-200",
					descripcion: "SKIN1004 Cleansing Oil 200 ml",
					cantidad: 1,
					precioUnitario: 21.2389,
					tipoVenta: "gravada",
				},
			],
			condicionOperacion: 1,
			pagos: [{ codigo: "05", monto: 24 }],
		});
		expect(expectedTotal).toBe(2400);
	});

	test("names a size counted in units and leaves out a missing one", () => {
		const { body } = build(
			order({
				lines: [
					line({ sizeValue: 70, sizeUnit: "units" }),
					line({ sku: "B", sizeValue: null, sizeUnit: null }),
				],
			}),
		);
		expect(body.items.map((i) => i.descripcion)).toEqual([
			"SKIN1004 Cleansing Oil 70 unidades",
			"SKIN1004 Cleansing Oil",
		]);
	});

	test("puts the discount into the line prices, the larger share on the larger line", () => {
		// 5.00 off 24.00 + 2 x 17.00 = 58.00: 2.07 and 2.93, by value.
		const { body, expectedTotal } = build(
			order({
				discount: 500,
				lines: [line(), line({ sku: "GEL", quantity: 2, unitPrice: 1700 })],
			}),
		);
		expect(expectedTotal).toBe(5300);
		expect(body.items.map((i) => i.precioUnitario)).toEqual([19.4071, 13.7478]);
		expect(charged(19.4071, 1)).toBe(2193);
		expect(charged(13.7478, 2)).toBe(3107);
		expect(body.pagos).toEqual([{ codigo: "05", monto: 53 }]);
	});

	test("gives a discount remainder tie to the earlier line", () => {
		// 1 cent over two equal lines.
		const { body } = build(
			order({
				discount: 1,
				lines: [line({ sku: "A" }), line({ sku: "B" })],
			}),
		);
		expect(body.items.map((i) => i.precioUnitario)).toEqual([21.2301, 21.2389]);
	});

	test("adds the shipping fee as its own line", () => {
		const { body, expectedTotal } = build(order({ shipping: 300 }));
		expect(body.items[1]).toEqual({
			codigo: "ENVIO",
			descripcion: "Envío",
			cantidad: 1,
			precioUnitario: 2.6549,
			tipoVenta: "gravada",
		});
		expect(expectedTotal).toBe(2700);
	});

	test("invoices only the units the customer kept", () => {
		const { body, expectedTotal } = build(
			order({
				lines: [
					line({ quantity: 3, returned: 1 }),
					line({ sku: "GONE", returned: 1 }),
				],
			}),
		);
		expect(body.items).toHaveLength(1);
		expect(body.items[0].cantidad).toBe(2);
		expect(expectedTotal).toBe(4800);
	});

	test("maps each payment method to Hacienda's code", () => {
		const code = (paymentMethod: InvoiceOrder["paymentMethod"]) =>
			build(order({ paymentMethod })).body.pagos[0].codigo;
		expect(code("bank_transfer")).toBe("05");
		expect(code("cash_on_delivery")).toBe("01");
		expect(code("cash")).toBe("01");
		expect(code("payment_link")).toBe("99");
	});

	test("carries the buyer and the seal wait only when given", () => {
		const receptor = {
			nombre: "Ana",
			tipoDocumento: "13" as const,
			numeroDocumento: "01234567-8",
		};
		const { body } = build(order(), { receptor, waitForSeal: 8 });
		expect(body.receptor).toEqual(receptor);
		expect(body.esperarSello).toBe(8);
		expect(build(order()).body).not.toContainKey("receptor");
		expect(build(order()).body).not.toContainKey("esperarSello");
	});

	test("refuses an order that owes nothing", () => {
		expect(() => build(order({ status: "cancelled" }))).toThrow(
			"Nothing to invoice: the order owes 0",
		);
	});

	test("every catalogue price comes back to itself at any quantity a line allows", () => {
		const prices = new Set(
			(catalog.products as { variant: { price: number } }[]).map(
				(p) => p.variant.price,
			),
		);
		for (const unitPrice of prices)
			for (let quantity = 1; quantity <= 20; quantity++) {
				const net = build(order({ lines: [line({ unitPrice, quantity })] }))
					.body.items[0].precioUnitario;
				expect([unitPrice, quantity, charged(net, quantity)]).toEqual([
					unitPrice,
					quantity,
					unitPrice * quantity,
				]);
			}
	});
});

describe("provider answers", () => {
	test("maps every estado and refuses an unknown one", () => {
		expect(statusFromProvider("PROCESANDO")).toBe("processing");
		expect(statusFromProvider("CONTINGENCIA")).toBe("contingency");
		expect(statusFromProvider("SELLADO")).toBe("sealed");
		expect(statusFromProvider("RECHAZADO")).toBe("rejected");
		expect(statusFromProvider("ANULADO")).toBe("voided");
		expect(() => statusFromProvider("BORRADOR")).toThrow(
			"Unknown DTE estado from the provider: BORRADOR",
		);
	});

	test("turns dollar amounts into cents and refuses a third decimal", () => {
		expect(minorUnits(97.37)).toBe(9737);
		expect(minorUnits(0.1 + 0.2)).toBe(30);
		expect(() => minorUnits(1.005)).toThrow("more than 2 decimals");
	});
});

describe("voidDeadline", () => {
	test("is 3 months after the seal, on the same day", () => {
		expect(voidDeadline("2026-11-01")).toBe("2027-02-01");
	});

	test("falls back to the last day of a shorter month, leap years included", () => {
		expect(voidDeadline("2026-11-30")).toBe("2027-02-28");
		expect(voidDeadline("2027-11-30")).toBe("2028-02-29");
	});
});

test("numbers each attempt of an order's Factura", () => {
	expect(invoiceKey("ECL-ABC123", 1)).toBe("ECL-ABC123-01-1");
	expect(invoiceKey("ECL-ABC123", 2)).toBe("ECL-ABC123-01-2");
});
