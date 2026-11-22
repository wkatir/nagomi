import { type WompiEnv, wompiCredentials } from "./wompi";

export type CardProvider = "wompi" | "demo";

export function cardProvider(
	env: WompiEnv,
	settings: { demoStore: boolean },
): CardProvider | null {
	if (wompiCredentials(env)) return "wompi";
	return settings.demoStore ? "demo" : null;
}

export const DEMO_TEST_CARDS = [
	{ number: "4242424242424242", brand: "Visa", approved: true },
	{ number: "4000000000000002", brand: "Visa", approved: false },
	{ number: "5555555555554444", brand: "Mastercard", approved: true },
] as const;

export function luhnValid(digits: string) {
	if (!/^\d{12,19}$/.test(digits)) return false;
	let sum = 0;
	for (let i = 0; i < digits.length; i++) {
		let d = Number(digits[digits.length - 1 - i]);
		if (i % 2 === 1) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
	}
	return sum % 10 === 0;
}

export type DemoCardInput = { number: string; expiry: string; cvc: string };

export type DemoCardErrors = Partial<
	Record<
		"cardNumber" | "expiry" | "cvc",
		"invalid" | "expired" | "not_test_card"
	>
>;

export type DemoCardOutcome =
	| {
			ok: true;
			approved: boolean;
			brand: string;
			last4: string;
	  }
	| { ok: false; fields: DemoCardErrors };

export function checkDemoCard(
	input: DemoCardInput,
	today: Date = new Date(),
): DemoCardOutcome {
	const fields: DemoCardErrors = {};
	const digits = input.number.replace(/[\s-]/g, "");
	const card = DEMO_TEST_CARDS.find((c) => c.number === digits);
	if (!luhnValid(digits)) fields.cardNumber = "invalid";
	else if (!card) fields.cardNumber = "not_test_card";
	const expiry = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(input.expiry.trim());
	const month = expiry ? Number(expiry[1]) : 0;
	if (!expiry || month < 1 || month > 12) fields.expiry = "invalid";
	else {
		const year =
			expiry[2].length === 2 ? 2000 + Number(expiry[2]) : Number(expiry[2]);
		const current = today.getUTCFullYear() * 12 + today.getUTCMonth();
		if (year * 12 + month - 1 < current) fields.expiry = "expired";
	}
	if (!/^\d{3,4}$/.test(input.cvc.trim())) fields.cvc = "invalid";
	if (Object.keys(fields).length > 0 || !card) return { ok: false, fields };
	return {
		ok: true,
		approved: card.approved,
		brand: card.brand,
		last4: digits.slice(-4),
	};
}
