import { useQuery } from "@tanstack/react-query";
import { useCart } from "#/lib/cart";
import { type CatalogProduct, catalogQuery } from "#/lib/queries";
import { getLocale } from "#/paraglide/runtime";

export type CartRow = {
	sku: string;
	quantity: number;
	// Missing when the SKU is no longer sold (unpublished, inactive or unpriced).
	product?: CatalogProduct;
};

// The cart lives in localStorage, so the catalog is fetched on the client to price it.
export function useCartRows() {
	const catalog = useQuery(catalogQuery(getLocale()));
	const lines = useCart();
	const rows: CartRow[] = lines.map((l) => ({
		...l,
		product: catalog.data?.products.find((p) => p.sku === l.sku),
	}));
	const priced = rows.flatMap((r) =>
		r.product ? [{ ...r, product: r.product }] : [],
	);
	return {
		catalog,
		rows,
		priced,
		hasUnavailable: priced.length < rows.length,
		hasBeyondStock: priced.some((r) => r.quantity > r.product.maxQuantity),
		subtotal: priced.reduce((n, r) => n + r.product.price * r.quantity, 0),
	};
}
