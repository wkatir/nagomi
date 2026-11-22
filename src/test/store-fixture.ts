import type { InferResponseType } from "hono/client";
import type { api } from "#/lib/api";

export type TestStore = InferResponseType<
	ReturnType<typeof api>["store"]["$get"],
	200
>;

export const testStore: TestStore = {
	name: "Nagomi",
	currency: "USD",
	defaultLocale: "es",
	demoStore: false,
	countryCode: "SV",
	timeZone: "America/El_Salvador",
	whatsappNumber: null,
	whatsappDisplay: null,
	taxRateBp: 1300,
	paymentDueHours: 48,
	cardProvider: null,
	freeShippingFrom: null,
	lowStockThreshold: 5,
	maxQuantityPerLine: 20,
	returnWindowDays: null,
	checkoutOpen: false,
	paymentMethods: [],
	paymentOptions: [],
	promises: { es: [], en: [] },
	footerPages: [],
	social: { discord: null, instagram: null, tiktok: null, youtube: null },
	business: {
		foundingYear: null,
		legalName: null,
		taxIdLabel: null,
		taxId: null,
		address: null,
		phone: null,
		email: null,
	},
};
