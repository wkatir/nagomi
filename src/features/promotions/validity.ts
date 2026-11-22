import type { Tone } from "#/components/admin/tone-badge";
import { m } from "#/paraglide/messages";

export const PROMOTION_VALIDITIES = [
	"current",
	"scheduled",
	"expired",
	"exhausted",
] as const;
export type PromotionValidity = (typeof PROMOTION_VALIDITIES)[number];

export function promotionValidity(
	promotion: {
		startsOn: string | null;
		endsOn: string | null;
		usage: number;
		usageLimit: number | null;
	},
	today: string,
): PromotionValidity {
	if (promotion.endsOn !== null && today > promotion.endsOn) return "expired";
	if (promotion.usageLimit !== null && promotion.usage >= promotion.usageLimit)
		return "exhausted";
	if (promotion.startsOn !== null && today < promotion.startsOn)
		return "scheduled";
	return "current";
}

export const validityLabel: Record<PromotionValidity, () => string> = {
	current: m.admin_promotion_validity_current,
	scheduled: m.admin_promotion_validity_scheduled,
	expired: m.admin_promotion_validity_expired,
	exhausted: m.admin_promotion_validity_exhausted,
};

export const validityTone: Record<PromotionValidity, Tone> = {
	current: "success",
	scheduled: "info",
	expired: "neutral",
	exhausted: "warning",
};
