import { expect, test } from "bun:test";
import { variantLabel } from "./variant-label";

test("names the brand, the product and the option", () => {
	expect(
		variantLabel({
			brand: "Akko",
			name: "Teclado Sakura 65%",
			sku: "TEC-002",
			optionLabel: "Switches rosas",
		}),
	).toBe("Akko Teclado Sakura 65% Switches rosas");
});

test("falls back to the SKU while the product has no name in the language", () => {
	expect(
		variantLabel({
			brand: "Akko",
			name: null,
			sku: "TEC-002",
			optionLabel: null,
		}),
	).toBe("Akko TEC-002");
});
