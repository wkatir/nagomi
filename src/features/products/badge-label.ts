import type { ProductBadge } from "#/lib/enums";
import { m } from "#/paraglide/messages";

export const badgeLabel: Record<ProductBadge, () => string> = {
	best_seller: m.admin_product_badge_best_seller,
	new: m.admin_product_badge_new,
};
