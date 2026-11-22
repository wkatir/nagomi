import { expect, test } from "bun:test";
import { checkoutConsents } from "./consents";

test("a checkout records both acknowledgements and both marketing choices", () => {
	expect(
		checkoutConsents(
			{
				privacyNotice: true,
				terms: true,
				marketingEmail: false,
				marketingWhatsapp: false,
			},
			{ privacy: 7, terms: 9 },
		),
	).toEqual([
		{ purpose: "privacy_notice", granted: true, pageVersionId: 7 },
		{ purpose: "terms", granted: true, pageVersionId: 9 },
		{ purpose: "marketing_email", granted: false, pageVersionId: 7 },
		{ purpose: "marketing_whatsapp", granted: false, pageVersionId: 7 },
	]);
});

test("a marketing yes is recorded per channel as granted, pointing at the privacy notice", () => {
	const rows = checkoutConsents(
		{
			privacyNotice: true,
			terms: true,
			marketingEmail: true,
			marketingWhatsapp: false,
		},
		{ privacy: 7, terms: 9 },
	);
	expect(rows.slice(2)).toEqual([
		{ purpose: "marketing_email", granted: true, pageVersionId: 7 },
		{ purpose: "marketing_whatsapp", granted: false, pageVersionId: 7 },
	]);
});
