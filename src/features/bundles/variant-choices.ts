import type {
	ProductChoice,
	ProductRow,
} from "../merchandising/product-search";

// An item is a variant, so each variant is its own choice.
export const variantChoices = (rows: ProductRow[]): ProductChoice[] =>
	rows
		.filter(
			(row) => row.variantStatus === "active" && row.status !== "archived",
		)
		.map((row) => {
			const size = row.optionLabel;
			return {
				key: row.variantId,
				label: [row.brand, row.name, size].filter(Boolean).join(" "),
				hint: row.sku,
				draft: row.status === "draft",
			};
		});
