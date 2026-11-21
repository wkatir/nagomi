import { formatSize } from "#/lib/size";
import type {
	ProductChoice,
	ProductRow,
} from "../merchandising/product-search";

// A step is a size, so each size is its own choice.
export const variantChoices = (rows: ProductRow[]): ProductChoice[] =>
	rows
		.filter(
			(row) => row.variantStatus === "active" && row.status !== "archived",
		)
		.map((row) => {
			const size =
				row.sizeValue !== null && row.sizeUnit
					? formatSize({ value: row.sizeValue, unit: row.sizeUnit })
					: null;
			return {
				key: row.variantId,
				label: [row.brand, row.name, size].filter(Boolean).join(" "),
				hint: row.sku,
				draft: row.status === "draft",
			};
		});
