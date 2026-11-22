import type { ProductBadge } from "#/lib/enums";
import { m } from "#/paraglide/messages";

export const productBadgeLabel: Record<ProductBadge, () => string> = {
	best_seller: m.product_badge_best_seller,
	new: m.product_badge_new,
};
