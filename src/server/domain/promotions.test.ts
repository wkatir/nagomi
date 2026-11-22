import { describe, expect, test } from "bun:test";
import {
	evaluatePromotion,
	normalizeCode,
	type PromotionRules,
	promotionDiscount,
} from "./promotions";

const tenPercent: PromotionRules = {
	type: "percentage",
	value: 10,
	minSubtotal: null,
	status: "active",
	startsOn: null,
	endsOn: null,
	usageLimit: null,
	perCustomerLimit: null,
	firstOrderOnly: false,
};
const fiveOff: PromotionRules = { ...tenPercent, type: "fixed", value: 500 };
const unused = { orders: 0, customerOrders: null, priorOrders: null };
const evaluate = (
	promotion: PromotionRules,
	subtotal: number,
	usage: {
		orders: number;
		customerOrders: number | null;
		priorOrders: number | null;
	} = unused,
	today = "2026-10-15",
) => evaluatePromotion(promotion, { subtotal, today, usage });

describe("normalizeCode", () => {
	test("trims and capitalizes what the customer typed", () => {
		expect(normalizeCode("  bienvenida10 ")).toBe("BIENVENIDA10");
		expect(normalizeCode("Hola-2026_x")).toBe("HOLA-2026_X");
	});

	test("refuses what cannot be a code", () => {
		expect(normalizeCode("ab")).toBeNull();
		expect(normalizeCode("two words")).toBeNull();
		expect(normalizeCode("descuento%")).toBeNull();
		expect(normalizeCode("ÑANDÚ")).toBeNull();
		expect(normalizeCode("X".repeat(33))).toBeNull();
	});
});

describe("promotionDiscount", () => {
	test("rounds a percentage half up to the minor unit", () => {
		expect(promotionDiscount(tenPercent, 1700)).toBe(170);
		// 1999 x 15% = 299.85 -> 300; 1990 x 15% = 298.5 -> 299; 1 x 49% = 0.49 -> 0.
		expect(promotionDiscount({ ...tenPercent, value: 15 }, 1999)).toBe(300);
		expect(promotionDiscount({ ...tenPercent, value: 15 }, 1990)).toBe(299);
		expect(promotionDiscount({ ...tenPercent, value: 49 }, 1)).toBe(0);
		expect(promotionDiscount({ ...tenPercent, value: 50 }, 1)).toBe(1);
		expect(promotionDiscount({ ...tenPercent, value: 50 }, 3)).toBe(2);
	});

	test("half off is the most a percentage takes", () => {
		expect(promotionDiscount({ ...tenPercent, value: 50 }, 4321)).toBe(2161);
		expect(() => promotionDiscount({ ...tenPercent, value: 51 }, 100)).toThrow(
			"Invalid percentage",
		);
	});

	test("a fixed amount never exceeds the subtotal, so the total never goes below zero", () => {
		expect(promotionDiscount(fiveOff, 1700)).toBe(500);
		expect(promotionDiscount(fiveOff, 500)).toBe(500);
		expect(promotionDiscount(fiveOff, 499)).toBe(499);
		expect(promotionDiscount(fiveOff, 0)).toBe(0);
	});

	test("gives nothing below the minimum subtotal and applies from it", () => {
		const min = { ...tenPercent, minSubtotal: 3000 };
		expect(promotionDiscount(min, 2999)).toBe(0);
		expect(promotionDiscount(min, 3000)).toBe(300);
	});

	test("matches the trigger formula for every subtotal and percentage", () => {
		for (let value = 1; value <= 50; value += 7)
			for (let subtotal = 0; subtotal <= 5000; subtotal += 37) {
				const discount = promotionDiscount({ ...tenPercent, value }, subtotal);
				// SQLite: (subtotal * value + 50) / 100 with integer division.
				expect(discount).toBe(Math.trunc((subtotal * value + 50) / 100));
				expect(discount).toBeGreaterThanOrEqual(0);
				expect(discount).toBeLessThanOrEqual(subtotal);
			}
	});

	test("refuses amounts that are not minor units and terms the table refuses", () => {
		expect(() => promotionDiscount(tenPercent, -1)).toThrow("Invalid subtotal");
		expect(() => promotionDiscount(tenPercent, 10.5)).toThrow(
			"Invalid subtotal",
		);
		expect(() => promotionDiscount({ ...tenPercent, value: 51 }, 100)).toThrow(
			"Invalid percentage",
		);
		expect(() => promotionDiscount({ ...tenPercent, value: 0 }, 100)).toThrow(
			"Invalid percentage",
		);
		expect(() => promotionDiscount({ ...fiveOff, value: 0 }, 100)).toThrow(
			"Invalid fixed amount",
		);
	});
});

describe("evaluatePromotion", () => {
	test("applies an active code with its discount", () => {
		expect(evaluate(tenPercent, 4300)).toEqual({
			ok: true,
			discount: 430,
			emailCheckPending: false,
		});
		expect(evaluate(fiveOff, 300)).toEqual({
			ok: true,
			discount: 300,
			emailCheckPending: false,
		});
	});

	test("an inactive or archived code is not found, like an unknown one", () => {
		expect(evaluate({ ...tenPercent, status: "inactive" }, 4300)).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(evaluate({ ...tenPercent, status: "archived" }, 4300)).toEqual({
			ok: false,
			reason: "not_found",
		});
	});

	test("dates are local days, both included", () => {
		const october = {
			...tenPercent,
			startsOn: "2026-10-10",
			endsOn: "2026-10-31",
		};
		expect(evaluate(october, 1000, unused, "2026-10-09")).toEqual({
			ok: false,
			reason: "not_started",
		});
		expect(evaluate(october, 1000, unused, "2026-10-10").ok).toBe(true);
		expect(evaluate(october, 1000, unused, "2026-10-31").ok).toBe(true);
		expect(evaluate(october, 1000, unused, "2026-11-01")).toEqual({
			ok: false,
			reason: "expired",
		});
	});

	test("the total limit counts the uses not released", () => {
		const three = { ...tenPercent, usageLimit: 3 };
		expect(evaluate(three, 1000, { ...unused, orders: 2 }).ok).toBe(true);
		expect(evaluate(three, 1000, { ...unused, orders: 3 })).toEqual({
			ok: false,
			reason: "usage_limit_reached",
		});
	});

	test("once per customer counts the uses of the email, checked later without one", () => {
		const once = { ...tenPercent, perCustomerLimit: 1 };
		expect(evaluate(once, 1000, { ...unused, orders: 5 })).toEqual({
			ok: true,
			discount: 100,
			emailCheckPending: true,
		});
		expect(
			evaluate(once, 1000, { orders: 5, customerOrders: 0, priorOrders: 0 }),
		).toEqual({ ok: true, discount: 100, emailCheckPending: false });
		expect(
			evaluate(once, 1000, { orders: 5, customerOrders: 1, priorOrders: 1 }),
		).toEqual({ ok: false, reason: "customer_limit_reached" });
	});

	test("a first-order code needs an email without earlier orders", () => {
		const first = { ...tenPercent, firstOrderOnly: true };
		expect(evaluate(first, 1000)).toEqual({
			ok: true,
			discount: 100,
			emailCheckPending: true,
		});
		expect(
			evaluate(first, 1000, { orders: 0, customerOrders: 0, priorOrders: 0 })
				.ok,
		).toBe(true);
		expect(
			evaluate(first, 1000, { orders: 0, customerOrders: 0, priorOrders: 1 }),
		).toEqual({ ok: false, reason: "first_order_only" });
	});

	test("refuses a subtotal below the minimum, which the customer can still reach", () => {
		const min = { ...fiveOff, minSubtotal: 3000 };
		expect(evaluate(min, 2999)).toEqual({
			ok: false,
			reason: "min_subtotal_not_met",
		});
		expect(evaluate(min, 3000)).toEqual({
			ok: true,
			discount: 500,
			emailCheckPending: false,
		});
	});

	test("reports dates and limits before the minimum", () => {
		const expired = { ...fiveOff, minSubtotal: 3000, endsOn: "2026-10-01" };
		expect(evaluate(expired, 100)).toEqual({ ok: false, reason: "expired" });
	});
});
