import { PRODUCT_STATUSES, type ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { canMoveStatus } from "#/server/domain/status";

// The lifecycle the API enforces.
export const slideMoves = (from: ProductStatus) =>
	PRODUCT_STATUSES.filter((to) => canMoveStatus(from, to));

export const moveLabel = (from: ProductStatus, to: ProductStatus) =>
	to === "published"
		? m.admin_slide_publish()
		: to === "archived"
			? m.admin_slide_archive()
			: from === "published"
				? m.admin_slide_unpublish()
				: m.admin_slide_restore();

// A published slide has no main move: unpublishing or archiving it is the exception.
export const primaryMove = (from: ProductStatus): ProductStatus | undefined =>
	from === "draft" ? "published" : from === "archived" ? "draft" : undefined;
