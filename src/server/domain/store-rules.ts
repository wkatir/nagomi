export const REQUIRED_SETTINGS = [
	"timeZone",
	"countryCode",
	"orderCodePrefix",
	"maxQuantityPerLine",
	"lowStockThreshold",
] as const;

// Consumer law requires the seller's legal identity to be shown before the purchase.
const CHECKOUT_REQUIRED = [
	"legalName",
	"taxIdLabel",
	"taxId",
	"address",
] as const;

export type CheckoutField = (typeof CHECKOUT_REQUIRED)[number];

export const missingCheckoutSettings = (
	settings: Record<CheckoutField, string | null> & { demoStore: boolean },
): CheckoutField[] =>
	settings.demoStore
		? []
		: CHECKOUT_REQUIRED.filter((key) => !settings[key]?.trim());
