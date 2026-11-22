import { BUNDLE_MIN_ITEMS } from "#/lib/schemas/bundles";

export type BundleLine = {
	variantId: number;
	quantity: number;
	price: number | null;
};

export type BundleRefusal =
	| { error: "bundle_requires_two_items" }
	| { error: "bundle_item_unavailable"; variantIds: number[] }
	| {
			error: "bundle_price_not_below_items";
			price: number;
			itemsTotal: number;
	  };

export function bundleRefusal(
	lines: BundleLine[],
	price: number,
): BundleRefusal | null {
	if (lines.length === 0) return null;
	if (lines.length < BUNDLE_MIN_ITEMS)
		return { error: "bundle_requires_two_items" };
	const unavailable = lines.filter((l) => l.price === null);
	if (unavailable.length > 0)
		return {
			error: "bundle_item_unavailable",
			variantIds: unavailable.map((l) => l.variantId),
		};
	const itemsTotal = lines.reduce(
		(n, l) => n + l.quantity * (l.price as number),
		0,
	);
	if (price >= itemsTotal)
		return { error: "bundle_price_not_below_items", price, itemsTotal };
	return null;
}
