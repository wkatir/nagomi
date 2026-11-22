// A product not yet named in the store's language is shown by its SKU.
export function variantLabel(variant: {
	brand: string;
	name: string | null;
	sku: string;
	optionLabel: string | null;
}) {
	return [variant.brand, variant.name ?? variant.sku, variant.optionLabel]
		.filter(Boolean)
		.join(" ");
}
