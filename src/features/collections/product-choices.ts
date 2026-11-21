import type {
	ProductChoice,
	ProductRow,
} from "../merchandising/product-search";

// Once per product, since the API lists a row per size.
export const productChoices = (rows: ProductRow[]): ProductChoice[] => {
	const seen = new Set<number>();
	return rows.flatMap((row) => {
		if (row.status === "archived" || seen.has(row.productId)) return [];
		seen.add(row.productId);
		return [
			{
				key: row.productId,
				label: [row.brand, row.name].filter(Boolean).join(" "),
				hint: row.slug,
				draft: row.status === "draft",
			},
		];
	});
};
