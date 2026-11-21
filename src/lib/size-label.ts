import { formatSize } from "./size";

// A product not yet named in the store's language is shown by its SKU.
export function sizeLabel(size: {
	brand: string;
	name: string | null;
	sku: string;
	sizeValue: number | null;
	sizeUnit: "ml" | "g" | "units" | null;
}) {
	return [
		size.brand,
		size.name ?? size.sku,
		size.sizeValue !== null && size.sizeUnit
			? formatSize({ value: size.sizeValue, unit: size.sizeUnit })
			: null,
	]
		.filter(Boolean)
		.join(" ");
}
