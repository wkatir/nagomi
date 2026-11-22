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
