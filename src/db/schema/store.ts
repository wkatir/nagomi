import { sql } from "drizzle-orm";
import {
	check,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
	ARCHIVABLE_STATUSES,
	LOCALES,
	PAYMENT_METHODS,
	SHIPPING_METHODS,
} from "#/lib/enums";
import { actor, createdAt, id, locale, oneOf, updatedAt } from "./_helpers";

// One deployment = one store.
export const storeSettings = sqliteTable(
	"store_settings",
	{
		id: integer("id").primaryKey(),
		name: text("name").notNull(),
		currency: text("currency").notNull(),
		defaultLocale: locale("default_locale"),
		// International format without "+" or spaces, as wa.me expects.
		whatsappNumber: text("whatsapp_number"),
		// Legal identity shown to customers; checkout stays closed until it is complete.
		legalName: text("legal_name"),
		// E.g. NIT, RFC, VAT.
		taxIdLabel: text("tax_id_label"),
		taxId: text("tax_id"),
		address: text("address"),
		phone: text("phone"),
		email: text("email"),
		// IANA zone (e.g. America/El_Salvador): defines "today" and every business day.
		timeZone: text("time_zone"),
		// ISO 3166-1 alpha-2; with the page language it forms the Intl locale (es-SV) and
		// is the default region when a phone number has no country code.
		countryCode: text("country_code", { length: 2 }),
		orderCodePrefix: text("order_code_prefix"),
		maxQuantityPerLine: integer("max_quantity_per_line"),
		// Lots received with less shelf life than this are flagged for a supplier swap.
		minShelfLifeDays: integer("min_shelf_life_days"),
		// Lots expiring within this many days are flagged in inventory and the dashboard.
		expiryWarningDays: integer("expiry_warning_days"),
		// Null when the store states no return window.
		returnWindowDays: integer("return_window_days"),
		foundingYear: integer("founding_year"),
		updatedAt: updatedAt(),
	},
	(t) => [
		check("store_settings_single_row", sql`${t.id} = 1`),
		check("store_settings_currency", sql`length(${t.currency}) = 3`),
		check(
			"store_settings_country",
			sql`${t.countryCode} is null or length(${t.countryCode}) = 2`,
		),
		check(
			"store_settings_days",
			sql`(${t.maxQuantityPerLine} is null or ${t.maxQuantityPerLine} > 0) and (${t.minShelfLifeDays} is null or ${t.minShelfLifeDays} > 0) and (${t.expiryWarningDays} is null or ${t.expiryWarningDays} > 0) and (${t.returnWindowDays} is null or ${t.returnWindowDays} > 0)`,
		),
	],
);

export const storePaymentMethods = sqliteTable(
	"store_payment_methods",
	{ method: text("method", { enum: PAYMENT_METHODS }).primaryKey() },
	(t) => [oneOf("store_payment_methods_method", t.method, PAYMENT_METHODS)],
);

// Only facts go here; a promise is published once it is true. Text may use
// {return_window_days}.
export const storePromises = sqliteTable("store_promises", {
	id: id(),
	slug: text("slug").notNull().unique(),
	position: integer("position").notNull().default(0),
	isPublished: integer("is_published", { mode: "boolean" })
		.notNull()
		.default(false),
});

export const storePromiseTranslations = sqliteTable(
	"store_promise_translations",
	{
		promiseId: integer("promise_id")
			.notNull()
			.references(() => storePromises.id),
		locale: locale(),
		title: text("title").notNull(),
		body: text("body"),
	},
	(t) => [primaryKey({ columns: [t.promiseId, t.locale] })],
);

// Their text is page_versions: the current text of a locale is its latest version.
export const pages = sqliteTable("pages", {
	id: id(),
	slug: text("slug").notNull().unique(),
	isPublished: integer("is_published", { mode: "boolean" })
		.notNull()
		.default(false),
	updatedAt: updatedAt(),
});

// Append-only history of every page text, numbered per (page, locale). A consent points at
// the exact version the customer was shown.
export const pageVersions = sqliteTable(
	"page_versions",
	{
		id: id(),
		pageId: integer("page_id")
			.notNull()
			.references(() => pages.id),
		locale: locale(),
		version: integer("version").notNull(),
		title: text("title").notNull(),
		bodyMarkdown: text("body_markdown").notNull(),
		createdAt: createdAt(),
		// Null for the seed; otherwise the admin who saved the text.
		createdBy: actor("created_by"),
	},
	(t) => [
		oneOf("page_versions_locale", t.locale, LOCALES),
		check("page_versions_version", sql`${t.version} > 0`),
		uniqueIndex("page_versions_unique").on(t.pageId, t.locale, t.version),
	],
);

// The fee is copied to the order when it is confirmed; later changes do not touch past
// orders.
export const shippingZones = sqliteTable(
	"shipping_zones",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		method: text("method", { enum: SHIPPING_METHODS }).notNull(),
		fee: integer("fee").notNull(),
		// Subtotal after discount from which the fee is waived. Null: never free.
		freeFrom: integer("free_from"),
		deliveryDaysMin: integer("delivery_days_min").notNull(),
		deliveryDaysMax: integer("delivery_days_max").notNull(),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
		position: integer("position").notNull().default(0),
	},
	(t) => [
		oneOf("shipping_zones_method", t.method, SHIPPING_METHODS),
		oneOf("shipping_zones_status", t.status, ARCHIVABLE_STATUSES),
		check(
			"shipping_zones_amounts",
			sql`${t.fee} >= 0 and (${t.freeFrom} is null or ${t.freeFrom} >= 0)`,
		),
		check(
			"shipping_zones_days",
			sql`${t.deliveryDaysMin} >= 0 and ${t.deliveryDaysMax} >= ${t.deliveryDaysMin}`,
		),
	],
);

export const shippingZoneTranslations = sqliteTable(
	"shipping_zone_translations",
	{
		zoneId: integer("zone_id")
			.notNull()
			.references(() => shippingZones.id),
		locale: locale(),
		name: text("name").notNull(),
		description: text("description"),
	},
	(t) => [primaryKey({ columns: [t.zoneId, t.locale] })],
);
