export const REQUIRED_SETTINGS = [
	"timeZone",
	"countryCode",
	"orderCodePrefix",
	"maxQuantityPerLine",
	"expiryWarningDays",
] as const;

// Consumer law requires the seller's legal identity to be shown before the purchase.
const CHECKOUT_REQUIRED = [
	"whatsappNumber",
	"legalName",
	"taxIdLabel",
	"taxId",
	"address",
] as const;

export type CheckoutField = (typeof CHECKOUT_REQUIRED)[number];

export const missingCheckoutSettings = (
	settings: Record<CheckoutField, string | null>,
): CheckoutField[] => CHECKOUT_REQUIRED.filter((key) => !settings[key]?.trim());
