import type { ProductStatus } from "#/db/schema";

// Shared by products, collections, routines and home slides.
const TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
	draft: ["published", "archived"],
	published: ["draft", "archived"],
	archived: ["draft"],
};

export const canMoveStatus = (from: ProductStatus, to: ProductStatus) =>
	TRANSITIONS[from].includes(to);
