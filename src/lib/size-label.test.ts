import { expect, test } from "bun:test";
import { sizeLabel } from "./size-label";

const aceite = {
	brand: "Brand",
	name: "Aceite",
	sku: "OIL-50",
	sizeValue: 50,
	sizeUnit: "ml",
} as const;

test("names a size by its brand, product and presentation", () => {
	expect(sizeLabel(aceite)).toBe("Brand Aceite 50 ml");
	expect(sizeLabel({ ...aceite, sizeValue: 3, sizeUnit: "g" })).toBe(
		"Brand Aceite 3 g",
	);
});

test("leaves out the presentation a size does not have", () => {
	expect(sizeLabel({ ...aceite, sizeValue: null, sizeUnit: null })).toBe(
		"Brand Aceite",
	);
});

test("shows the SKU where the product has no name yet", () => {
	expect(sizeLabel({ ...aceite, name: null })).toBe("Brand OIL-50 50 ml");
});
