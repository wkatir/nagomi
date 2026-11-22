import { expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { sellerDetails } from "./seller";

const business = {
	legalName: "Nagomi, S.A. de C.V.",
	taxIdLabel: "NIT",
	taxId: "0614-010101-101-1",
	address: "San Salvador",
	phone: null,
	email: "ventas@nagomi.com.sv",
};

test("a registered store shows its legal identity, skipping what is not set", () => {
	expect(sellerDetails({ demoStore: false, business })).toEqual([
		"Nagomi, S.A. de C.V.",
		"NIT 0614-010101-101-1",
		"San Salvador",
		"ventas@nagomi.com.sv",
	]);
});

test("a demo store shows the academic identity and the demo notice, never a legal name", () => {
	expect(sellerDetails({ demoStore: true, business })).toEqual([
		m.store_demo_seller(),
		m.store_demo_notice(),
	]);
});
