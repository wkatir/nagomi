import { expect, test } from "bun:test";
import { missingCheckoutSettings } from "./store-rules";

const complete = {
	legalName: "Nagomi",
	taxIdLabel: "NIT",
	taxId: "0614-000000-000-0",
	address: "San Salvador",
	demoStore: false,
};

test("checkout opens only with the legal identity", () => {
	expect(missingCheckoutSettings(complete)).toEqual([]);
	expect(
		missingCheckoutSettings({ ...complete, taxId: null, address: "  " }),
	).toEqual(["taxId", "address"]);
	expect(
		missingCheckoutSettings({
			legalName: null,
			taxIdLabel: null,
			taxId: null,
			address: null,
			demoStore: false,
		}),
	).toEqual(["legalName", "taxIdLabel", "taxId", "address"]);
});

test("a demo store opens checkout without a legal identity", () => {
	expect(
		missingCheckoutSettings({
			legalName: null,
			taxIdLabel: null,
			taxId: null,
			address: null,
			demoStore: true,
		}),
	).toEqual([]);
});
