import { expect, test } from "bun:test";
import { missingCheckoutSettings } from "./store-rules";

const complete = {
	whatsappNumber: "50370000000",
	legalName: "Eclalune",
	taxIdLabel: "NIT",
	taxId: "0614-000000-000-0",
	address: "San Salvador",
};

test("checkout opens only with the WhatsApp number and the legal identity", () => {
	expect(missingCheckoutSettings(complete)).toEqual([]);
	expect(
		missingCheckoutSettings({ ...complete, taxId: null, address: "  " }),
	).toEqual(["taxId", "address"]);
	expect(
		missingCheckoutSettings({
			whatsappNumber: null,
			legalName: null,
			taxIdLabel: null,
			taxId: null,
			address: null,
		}),
	).toEqual(["whatsappNumber", "legalName", "taxIdLabel", "taxId", "address"]);
});
