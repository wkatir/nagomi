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
import {
	createdAt,
	id,
	isDate,
	locale,
	oneOf,
	seoText,
	slugCheck,
	updatedAt,
} from "./_helpers";
import { concerns, mediaFiles, products, variants } from "./catalog";
import { PRODUCT_STATUSES } from "./enums";

// Only published products are shown in it.
export const collections = sqliteTable(
	"collections",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		status: text("status", { enum: PRODUCT_STATUSES })
			.notNull()
			.default("draft"),
		position: integer("position").notNull().default(0),
		showOnHome: integer("show_on_home", { mode: "boolean" })
			.notNull()
			.default(false),
		coverMediaId: integer("cover_media_id").references(() => mediaFiles.id),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		slugCheck("collections_slug", t.slug),
		oneOf("collections_status", t.status, PRODUCT_STATUSES),
		check("collections_position", sql`${t.position} >= 0`),
		index("collections_status_idx").on(t.status, t.position),
	],
);

export const collectionTranslations = sqliteTable(
	"collection_translations",
	{
		collectionId: integer("collection_id")
			.notNull()
			.references(() => collections.id),
		locale: locale(),
		title: text("title").notNull(),
		description: text("description"),
		coverAlt: text("cover_alt"),
		...seoText(),
	},
	(t) => [primaryKey({ columns: [t.collectionId, t.locale] })],
);

export const collectionProducts = sqliteTable(
	"collection_products",
	{
		collectionId: integer("collection_id")
			.notNull()
			.references(() => collections.id),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		position: integer("position").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.collectionId, t.productId] }),
		uniqueIndex("collection_products_position").on(t.collectionId, t.position),
		index("collection_products_product_idx").on(t.productId),
		check("collection_products_position_positive", sql`${t.position} > 0`),
	],
);

// Shown while published and, when set, between its local start and end dates (store time
// zone, both included). The link is a storefront path without the locale prefix (e.g.
// /products?category=sunscreen); the storefront adds it.
export const homeSlides = sqliteTable(
	"home_slides",
	{
		id: id(),
		status: text("status", { enum: PRODUCT_STATUSES })
			.notNull()
			.default("draft"),
		position: integer("position").notNull().default(0),
		desktopMediaId: integer("desktop_media_id")
			.notNull()
			.references(() => mediaFiles.id),
		mobileMediaId: integer("mobile_media_id").references(() => mediaFiles.id),
		linkPath: text("link_path").notNull(),
		startsOn: text("starts_on"),
		endsOn: text("ends_on"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("home_slides_status", t.status, PRODUCT_STATUSES),
		check("home_slides_position", sql`${t.position} >= 0`),
		check(
			"home_slides_link_path",
			sql`${t.linkPath} glob '/*' and ${t.linkPath} not glob '//*' and ${t.linkPath} not glob '*[^!-~]*' and ${t.linkPath} not glob '*\\*' and length(${t.linkPath}) <= 300`,
		),
		check(
			"home_slides_dates",
			sql`(${t.startsOn} is null or ${isDate(t.startsOn)}) and (${t.endsOn} is null or ${isDate(t.endsOn)}) and (${t.startsOn} is null or ${t.endsOn} is null or ${t.startsOn} <= ${t.endsOn})`,
		),
		index("home_slides_status_idx").on(t.status, t.position),
	],
);

export const homeSlideTranslations = sqliteTable(
	"home_slide_translations",
	{
		slideId: integer("slide_id")
			.notNull()
			.references(() => homeSlides.id),
		locale: locale(),
		title: text("title").notNull(),
		body: text("body"),
		ctaLabel: text("cta_label"),
		// The mobile crop shows the same scene.
		imageAlt: text("image_alt").notNull(),
	},
	(t) => [primaryKey({ columns: [t.slideId, t.locale] })],
);

export const routines = sqliteTable(
	"routines",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		status: text("status", { enum: PRODUCT_STATUSES })
			.notNull()
			.default("draft"),
		isFeatured: integer("is_featured", { mode: "boolean" })
			.notNull()
			.default(false),
		position: integer("position").notNull().default(0),
		// The need this routine answers, shown on that need's page. A routine's steps can
		// carry several needs, so this cannot be derived.
		concernId: integer("concern_id").references(() => concerns.id),
	},
	(t) => [
		slugCheck("routines_slug", t.slug),
		oneOf("routines_status", t.status, PRODUCT_STATUSES),
	],
);

export const routineTranslations = sqliteTable(
	"routine_translations",
	{
		routineId: integer("routine_id")
			.notNull()
			.references(() => routines.id),
		locale: locale(),
		title: text("title").notNull(),
		description: text("description"),
		...seoText(),
	},
	(t) => [primaryKey({ columns: [t.routineId, t.locale] })],
);

export const routineItems = sqliteTable(
	"routine_items",
	{
		routineId: integer("routine_id")
			.notNull()
			.references(() => routines.id),
		variantId: integer("variant_id")
			.notNull()
			.references(() => variants.id),
		position: integer("position").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.routineId, t.variantId] }),
		uniqueIndex("routine_items_position").on(t.routineId, t.position),
		index("routine_items_variant_idx").on(t.variantId),
	],
);
