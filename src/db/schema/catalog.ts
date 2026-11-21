import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import {
	actor,
	createdAt,
	id,
	locale,
	oneOf,
	seoText,
	slugCheck,
	updatedAt,
} from "./_helpers";
import {
	IMAGE_KINDS,
	IMAGE_TYPES,
	PRODUCT_STATUSES,
	SIZE_UNITS,
	SKIN_TYPES,
} from "./enums";

export const brands = sqliteTable(
	"brands",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		name: text("name").notNull(),
		// searchKey() of name and slug (src/server/domain/search.ts), written by the API.
		searchKey: text("search_key").notNull(),
		countryCode: text("country_code", { length: 2 }),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
	},
	(t) => [
		slugCheck("brands_slug", t.slug),
		oneOf("brands_status", t.status, ARCHIVABLE_STATUSES),
		check(
			"brands_country",
			sql`${t.countryCode} is null or length(${t.countryCode}) = 2`,
		),
	],
);

export const brandTranslations = sqliteTable(
	"brand_translations",
	{
		brandId: integer("brand_id")
			.notNull()
			.references(() => brands.id),
		locale: locale(),
		description: text("description"),
		...seoText(),
	},
	(t) => [primaryKey({ columns: [t.brandId, t.locale] })],
);

export const categories = sqliteTable(
	"categories",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		// Order of use in a routine (1 = first). Drives sorting, not business rules.
		routineStep: integer("routine_step").notNull(),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
	},
	(t) => [
		slugCheck("categories_slug", t.slug),
		oneOf("categories_status", t.status, ARCHIVABLE_STATUSES),
		check("categories_routine_step", sql`${t.routineStep} > 0`),
	],
);

export const categoryTranslations = sqliteTable(
	"category_translations",
	{
		categoryId: integer("category_id")
			.notNull()
			.references(() => categories.id),
		locale: locale(),
		name: text("name").notNull(),
		description: text("description"),
		...seoText(),
	},
	(t) => [primaryKey({ columns: [t.categoryId, t.locale] })],
);

export const concerns = sqliteTable(
	"concerns",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		position: integer("position").notNull().default(0),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
	},
	(t) => [
		slugCheck("concerns_slug", t.slug),
		oneOf("concerns_status", t.status, ARCHIVABLE_STATUSES),
	],
);

export const concernTranslations = sqliteTable(
	"concern_translations",
	{
		concernId: integer("concern_id")
			.notNull()
			.references(() => concerns.id),
		locale: locale(),
		name: text("name").notNull(),
		description: text("description"),
		...seoText(),
	},
	(t) => [primaryKey({ columns: [t.concernId, t.locale] })],
);

export const products = sqliteTable(
	"products",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		brandId: integer("brand_id")
			.notNull()
			.references(() => brands.id),
		categoryId: integer("category_id")
			.notNull()
			.references(() => categories.id),
		status: text("status", { enum: PRODUCT_STATUSES })
			.notNull()
			.default("draft"),
		// INCI names are international; they are not translated.
		inci: text("inci"),
		sanitaryRegistration: text("sanitary_registration"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("products_status", t.status, PRODUCT_STATUSES),
		slugCheck("products_slug", t.slug),
		index("products_brand_idx").on(t.brandId),
		index("products_category_idx").on(t.categoryId),
		index("products_status_idx").on(t.status),
	],
);

export const productTranslations = sqliteTable(
	"product_translations",
	{
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		locale: locale(),
		name: text("name").notNull(),
		// searchKey() of the name (src/server/domain/search.ts), written by the API.
		searchKey: text("search_key").notNull(),
		tagline: text("tagline"),
		description: text("description"),
		howToUse: text("how_to_use"),
		// One per line.
		keyIngredients: text("key_ingredients"),
		// The brand's cosmetic benefits, one per line.
		benefits: text("benefits"),
		cautions: text("cautions"),
		...seoText(),
	},
	(t) => [primaryKey({ columns: [t.productId, t.locale] })],
);

export const productConcerns = sqliteTable(
	"product_concerns",
	{
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		concernId: integer("concern_id")
			.notNull()
			.references(() => concerns.id),
	},
	(t) => [
		primaryKey({ columns: [t.productId, t.concernId] }),
		index("product_concerns_concern_idx").on(t.concernId),
	],
);

export const productSkinTypes = sqliteTable(
	"product_skin_types",
	{
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		skinType: text("skin_type", { enum: SKIN_TYPES }).notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.productId, t.skinType] }),
		oneOf("product_skin_types_skin_type", t.skinType, SKIN_TYPES),
	],
);

// An active variant of a published product always has a price, and a published product has
// at least one active priced variant (API checks, enforced by triggers).
export const variants = sqliteTable(
	"variants",
	{
		id: id(),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		sku: text("sku").notNull().unique(),
		// searchKey() of SKU and barcode (src/server/domain/search.ts), written by the API.
		searchKey: text("search_key").notNull(),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
		// Null until the presentation is confirmed by the supplier.
		sizeValue: integer("size_value"),
		sizeUnit: text("size_unit", { enum: SIZE_UNITS }),
		// Null only while the product is a draft.
		price: integer("price"),
		compareAtPrice: integer("compare_at_price"),
		// On-hand units at or below which the variant needs reordering. Null: not tracked.
		reorderPoint: integer("reorder_point"),
		// GS1 barcode stored as GTIN-14 (shorter GTINs left-padded with zeros).
		gtin: text("gtin"),

		createdAt: createdAt(),
	},
	(t) => [
		oneOf("variants_status", t.status, ARCHIVABLE_STATUSES),
		oneOf("variants_size_unit", t.sizeUnit, SIZE_UNITS),
		index("variants_product_idx").on(t.productId),
		check("variants_price_positive", sql`${t.price} is null or ${t.price} > 0`),
		check(
			"variants_compare_at_gt_price",
			sql`${t.compareAtPrice} is null or (${t.price} is not null and ${t.compareAtPrice} > ${t.price})`,
		),
		check(
			"variants_size_pair",
			sql`(${t.sizeValue} is null) = (${t.sizeUnit} is null) and (${t.sizeValue} is null or ${t.sizeValue} > 0)`,
		),
		check(
			"variants_reorder_point",
			sql`${t.reorderPoint} is null or ${t.reorderPoint} >= 0`,
		),
		check(
			"variants_gtin",
			sql`${t.gtin} is null or (length(${t.gtin}) = 14 and ${t.gtin} not glob '*[^0-9]*')`,
		),

		uniqueIndex("variants_gtin_unique").on(t.gtin).where(sql`gtin is not null`),
	],
);

// Stored in R2 under its content key (<sha256>.<ext>). A row never changes and is never
// deleted: a key always names the same bytes.
export const mediaFiles = sqliteTable(
	"media_files",
	{
		id: id(),
		r2Key: text("r2_key").notNull().unique(),
		contentType: text("content_type", { enum: IMAGE_TYPES }).notNull(),
		byteSize: integer("byte_size").notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		createdAt: createdAt(),
		// Null for the seed; otherwise the admin who uploaded it.
		createdBy: actor("created_by"),
	},
	(t) => [
		oneOf("media_files_content_type", t.contentType, IMAGE_TYPES),
		check(
			"media_files_size",
			sql`${t.byteSize} > 0 and ${t.width} > 0 and ${t.height} > 0`,
		),
		check(
			"media_files_key",
			sql`length(${t.r2Key}) between 68 and 69 and substr(${t.r2Key}, 1, 64) not glob '*[^0-9a-f]*' and substr(${t.r2Key}, 65) in ('.jpg', '.png', '.webp', '.avif')`,
		),
	],
);

// A variant id limits it to one size; null shows it for every size. Archived, never deleted.
export const productImages = sqliteTable(
	"product_images",
	{
		id: id(),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		variantId: integer("variant_id").references(() => variants.id),
		mediaFileId: integer("media_file_id")
			.notNull()
			.references(() => mediaFiles.id),
		kind: text("kind", { enum: IMAGE_KINDS }).notNull(),
		position: integer("position").notNull().default(0),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
		createdAt: createdAt(),
		// Null for the seed; otherwise the admin who uploaded it.
		createdBy: actor("created_by"),
	},
	(t) => [
		oneOf("product_images_kind", t.kind, IMAGE_KINDS),
		oneOf("product_images_status", t.status, ARCHIVABLE_STATUSES),
		index("product_images_product_idx").on(t.productId, t.status, t.position),
		uniqueIndex("product_images_product_file")
			.on(t.productId, t.mediaFileId)
			.where(sql`status = 'active'`),
	],
);

// The store's default locale is required (API check).
export const productImageTranslations = sqliteTable(
	"product_image_translations",
	{
		imageId: integer("image_id")
			.notNull()
			.references(() => productImages.id),
		locale: locale(),
		alt: text("alt").notNull(),
	},
	(t) => [primaryKey({ columns: [t.imageId, t.locale] })],
);
