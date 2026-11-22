import type { PromotionType } from "#/db/schema";

// The same formula as the orders_promotion_discount_insert trigger
// (drizzle/0001_integrity_triggers.sql).
type PromotionTerms = {
	type: PromotionType;
	// percentage: whole percent (1-50); fixed: minor units.
	value: number;
	minSubtotal: number | null;
};

export type PromotionRules = PromotionTerms & {
	status: "active" | "inactive" | "archived";
	startsOn: string | null;
	endsOn: string | null;
	usageLimit: number | null;
	perCustomerLimit: number | null;
	firstOrderOnly: boolean;
};

// Redemptions not released. The per-customer figures are null while the email is not known
// (a guest's cart): those rules are then checked when the order is placed.
export type PromotionUsage = {
	orders: number;
	customerOrders: number | null;
	// Orders of that email that were not cancelled.
	priorOrders: number | null;
};

// An inactive or archived code is "not_found", like a code that does not exist.
export type PromotionRefusal =
	| "not_found"
	| "not_started"
	| "expired"
	| "usage_limit_reached"
	| "customer_limit_reached"
	| "first_order_only"
	| "min_subtotal_not_met";

export type PromotionResult =
	| { ok: true; discount: number; emailCheckPending: boolean }
	| { ok: false; reason: PromotionRefusal };

const CODE = /^[A-Z0-9_-]{3,32}$/;

export function normalizeCode(input: string): string | null {
	const code = input.trim().toUpperCase();
	return CODE.test(code) ? code : null;
}

const minorUnits = (n: number, what: string) => {
	if (!Number.isSafeInteger(n) || n < 0)
		throw new Error(`Invalid ${what} ${n}`);
};

export function promotionDiscount(
	terms: PromotionTerms,
	subtotal: number,
): number {
	minorUnits(subtotal, "subtotal");
	if (terms.minSubtotal !== null && subtotal < terms.minSubtotal) return 0;
	if (terms.type === "percentage") {
		if (!Number.isInteger(terms.value) || terms.value < 1 || terms.value > 50)
			throw new Error(`Invalid percentage ${terms.value}`);
		return Math.floor((subtotal * terms.value + 50) / 100);
	}
	if (!Number.isSafeInteger(terms.value) || terms.value < 1)
		throw new Error(`Invalid fixed amount ${terms.value}`);
	return Math.min(terms.value, subtotal);
}

// `today` is the store's local date.
export function evaluatePromotion(
	promotion: PromotionRules,
	{
		subtotal,
		today,
		usage,
	}: { subtotal: number; today: string; usage: PromotionUsage },
): PromotionResult {
	minorUnits(subtotal, "subtotal");
	if (promotion.status !== "active") return { ok: false, reason: "not_found" };
	if (promotion.startsOn !== null && today < promotion.startsOn)
		return { ok: false, reason: "not_started" };
	if (promotion.endsOn !== null && today > promotion.endsOn)
		return { ok: false, reason: "expired" };
	if (promotion.usageLimit !== null && usage.orders >= promotion.usageLimit)
		return { ok: false, reason: "usage_limit_reached" };
	if (
		promotion.perCustomerLimit !== null &&
		usage.customerOrders !== null &&
		usage.customerOrders >= promotion.perCustomerLimit
	)
		return { ok: false, reason: "customer_limit_reached" };
	if (
		promotion.firstOrderOnly &&
		usage.priorOrders !== null &&
		usage.priorOrders > 0
	)
		return { ok: false, reason: "first_order_only" };
	if (promotion.minSubtotal !== null && subtotal < promotion.minSubtotal)
		return { ok: false, reason: "min_subtotal_not_met" };
	return {
		ok: true,
		discount: promotionDiscount(promotion, subtotal),
		emailCheckPending:
			(promotion.perCustomerLimit !== null && usage.customerOrders === null) ||
			(promotion.firstOrderOnly && usage.priorOrders === null),
	};
}
