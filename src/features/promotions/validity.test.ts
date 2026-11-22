import { describe, expect, test } from "bun:test";
import { promotionValidity } from "./validity";

const promo = (p: Partial<Parameters<typeof promotionValidity>[0]>) => ({
	startsOn: null,
	endsOn: null,
	usage: 0,
	usageLimit: null,
	...p,
});
const today = "2026-11-21";

describe("promotionValidity", () => {
	test("a code without dates or limit is current", () => {
		expect(promotionValidity(promo({}), today)).toBe("current");
	});

	test("both ends of the dates are days it applies", () => {
		expect(
			promotionValidity(
				promo({ startsOn: "2026-11-21", endsOn: "2026-11-21" }),
				today,
			),
		).toBe("current");
		expect(promotionValidity(promo({ startsOn: "2026-11-22" }), today)).toBe(
			"scheduled",
		);
		expect(promotionValidity(promo({ endsOn: "2026-11-20" }), today)).toBe(
			"expired",
		);
	});

	test("used up to its limit it is exhausted, and an ended one stays expired", () => {
		expect(promotionValidity(promo({ usage: 10, usageLimit: 10 }), today)).toBe(
			"exhausted",
		);
		expect(
			promotionValidity(
				promo({ usage: 10, usageLimit: 10, endsOn: "2026-01-01" }),
				today,
			),
		).toBe("expired");
	});
});
