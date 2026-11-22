import { z } from "zod";
import { PRODUCT_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const PRODUCT_SORTS = [
	"name",
	"brand",
	"status",
	"createdAt",
	"priceFrom",
	"stock",
] as const;

const id = z.coerce.number().int().positive();

// `q` matches the name, the brand, the SKU or barcode of any variant, and the slug.
export const productListSearch = pagedSearch(PRODUCT_SORTS, {
	sort: "createdAt",
	dir: "desc",
}).extend({
	status: z.enum(PRODUCT_STATUSES).optional(),
	brandId: id.optional(),
	categoryId: id.optional(),
});
export type ProductListSearch = z.infer<typeof productListSearch>;

// Shared by the API and the forms.
export const PRODUCT_LIMITS = {
	slug: 80,
	sku: 7,
	optionLabel: 60,
	alt: 250,
	name: 200,
	tagline: 300,
	shortSpecs: 120,
	description: 4000,
	specLabel: 60,
	specValue: 200,
	specs: 20,
	warrantyMonths: 120,
	seoTitle: 70,
	seoDescription: 160,
} as const;

// In the order a person fixes them.
export const PUBLISH_REQUIREMENTS = [
	"text",
	"price",
	"photo_alt",
	"brand",
	"category",
] as const;
export type PublishRequirement = (typeof PUBLISH_REQUIREMENTS)[number];
