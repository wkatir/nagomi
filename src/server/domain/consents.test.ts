import { expect, test } from "bun:test";
import { checkoutConsents } from "./consents";

test("a checkout records both acknowledgements and the marketing choice", () => {
	expect(
		checkoutConsents(
			{ privacyNotice: true, terms: true, marketingWhatsapp: false },
			{ privacy: 7, terms: 9 },
		),
	).toEqual([
		{ purpose: "privacy_notice", granted: true, pageVersionId: 7 },
		{ purpose: "terms", granted: true, pageVersionId: 9 },
		{ purpose: "marketing_whatsapp", granted: false, pageVersionId: 7 },
	]);
});

test("a marketing yes is recorded as granted, pointing at the privacy notice", () => {
	const rows = checkoutConsents(
		{ privacyNotice: true, terms: true, marketingWhatsapp: true },
		{ privacy: 7, terms: 9 },
	);
	expect(rows.at(-1)).toEqual({
		purpose: "marketing_whatsapp",
		granted: true,
		pageVersionId: 7,
	});
});
