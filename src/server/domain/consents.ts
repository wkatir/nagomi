import type { ConsentPurpose } from "#/db/schema";

// Marketing permissions are explained in the privacy notice.
export const CHECKOUT_PAGES = ["privacy", "terms"] as const;
export type CheckoutPage = (typeof CHECKOUT_PAGES)[number];

export type CheckoutConsentInput = {
	privacyNotice: true;
	terms: true;
	marketingEmail: boolean;
	marketingWhatsapp: boolean;
};

// The marketing choice is recorded either way: a refusal is evidence too.
export function checkoutConsents(
	input: CheckoutConsentInput,
	versions: Record<CheckoutPage, number>,
): { purpose: ConsentPurpose; granted: boolean; pageVersionId: number }[] {
	return [
		{
			purpose: "privacy_notice",
			granted: input.privacyNotice,
			pageVersionId: versions.privacy,
		},
		{ purpose: "terms", granted: input.terms, pageVersionId: versions.terms },
		{
			purpose: "marketing_email",
			granted: input.marketingEmail,
			pageVersionId: versions.privacy,
		},
		{
			purpose: "marketing_whatsapp",
			granted: input.marketingWhatsapp,
			pageVersionId: versions.privacy,
		},
	];
}
