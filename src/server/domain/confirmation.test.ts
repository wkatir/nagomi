import { describe, expect, test } from "bun:test";
import { confirmationMessage } from "./confirmation";

const base = {
	storeName: "Nagomi",
	code: "NAG-23Z229",
	locale: "es" as const,
	countryCode: "SV",
	currency: "USD",
	lines: [
		{
			quantity: 1,
			unitPrice: 2400,
			brandName: "Akko",
			productName: "Teclado Mecánico Sakura 65%",
			optionLabel: "Switches rosas",
		},
		{
			quantity: 2,
			unitPrice: 1700,
			brandName: "Nagomi",
			productName: "Kit Organizador de Cables",
			optionLabel: null,
		},
	],
	subtotal: 5800,
	discount: 300,
	discountReason: "combo",
	shipping: 350,
	shippingMethod: "own_delivery" as const,
	zoneName: "San Salvador",
	total: 5850,
	paymentMethod: "bank_transfer" as const,
	delivery: { from: "2026-10-06", to: "2026-10-07" },
};

describe("confirmationMessage", () => {
	test("states every price, shipping, total, payment and delivery time", () => {
		expect(confirmationMessage(base)).toBe(
			[
				"Nagomi: tu pedido NAG-23Z229 está confirmado.",
				"• 1 × Akko Teclado Mecánico Sakura 65% Switches rosas: $24.00",
				"• 2 × Nagomi Kit Organizador de Cables: $34.00",
				"Subtotal: $58.00",
				"Descuento (combo): −$3.00",
				"Envío (Entrega a domicilio, San Salvador): $3.50",
				"Total: $58.50",
				"Pago: Transferencia bancaria",
				"Entrega estimada: entre el 6 de octubre de 2026 y el 7 de octubre de 2026",
			].join("\n"),
		);
	});

	test("writes free pickup on a single day in English", () => {
		const text = confirmationMessage({
			...base,
			locale: "en",
			discount: 0,
			discountReason: null,
			shipping: 0,
			shippingMethod: "pickup",
			zoneName: null,
			total: 5800,
			paymentMethod: "cash",
			delivery: { from: "2026-10-06", to: "2026-10-06" },
		});
		expect(text).toContain("Shipping (Pickup): free");
		expect(text).toContain("Ready for pickup: October 6, 2026");
		expect(text).not.toContain("Discount");
	});

	test("refuses a discount without its reason", () => {
		expect(() =>
			confirmationMessage({ ...base, discountReason: null }),
		).toThrow("reason");
	});
});
