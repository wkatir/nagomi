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
	ARCHIVABLE_STATUSES,
	LOCALES,
	PAYMENT_METHODS,
	SHIPPING_METHODS,
} from "#/lib/enums";
import { SV_MUNICIPALITIES } from "#/lib/sv-locations";
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
		// Null when the store states no return window.
		returnWindowDays: integer("return_window_days"),
		foundingYear: integer("founding_year"),
		freeShippingFrom: integer("free_shipping_from"),
		lowStockThreshold: integer("low_stock_threshold"),
		frequentCustomerMinOrders: integer("frequent_customer_min_orders"),
		inactiveCustomerDays: integer("inactive_customer_days"),
		followupPendingPaymentHours: integer("followup_pending_payment_hours"),
		followupPaidUnshippedHours: integer("followup_paid_unshipped_hours"),
		followupShippedUndeliveredHours: integer(
			"followup_shipped_undelivered_hours",
		),
		// IVA included in every price, in basis points (1300 = 13 %).
		taxRateBp: integer("tax_rate_bp"),
		bankName: text("bank_name"),
		bankAccountType: text("bank_account_type"),
		bankAccountNumber: text("bank_account_number"),
		bankAccountHolder: text("bank_account_holder"),
		discordUrl: text("discord_url"),
		instagramUrl: text("instagram_url"),
		tiktokUrl: text("tiktok_url"),
		youtubeUrl: text("youtube_url"),
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
			sql`(${t.maxQuantityPerLine} is null or ${t.maxQuantityPerLine} > 0) and (${t.returnWindowDays} is null or ${t.returnWindowDays} > 0)`,
		),
		check(
			"store_settings_thresholds",
			sql`(${t.freeShippingFrom} is null or ${t.freeShippingFrom} >= 0) and (${t.lowStockThreshold} is null or ${t.lowStockThreshold} >= 0) and (${t.frequentCustomerMinOrders} is null or ${t.frequentCustomerMinOrders} > 1) and (${t.inactiveCustomerDays} is null or ${t.inactiveCustomerDays} > 0)`,
		),
		check(
			"store_settings_followup_hours",
			sql`(${t.followupPendingPaymentHours} is null or ${t.followupPendingPaymentHours} > 0) and (${t.followupPaidUnshippedHours} is null or ${t.followupPaidUnshippedHours} > 0) and (${t.followupShippedUndeliveredHours} is null or ${t.followupShippedUndeliveredHours} > 0)`,
		),
		check(
			"store_settings_tax_rate",
			sql`${t.taxRateBp} is null or ${t.taxRateBp} between 0 and 5000`,
		),
		check(
			"store_settings_social_urls",
			sql`(${t.discordUrl} is null or ${t.discordUrl} glob 'https://*') and (${t.instagramUrl} is null or ${t.instagramUrl} glob 'https://*') and (${t.tiktokUrl} is null or ${t.tiktokUrl} glob 'https://*') and (${t.youtubeUrl} is null or ${t.youtubeUrl} glob 'https://*')`,
		),
	],
);

export const storePaymentMethods = sqliteTable(
	"store_payment_methods",
	{
		method: text("method", { enum: PAYMENT_METHODS }).primaryKey(),
		position: integer("position").notNull().default(0),
		maxTotal: integer("max_total"),
		shippingZoneId: integer("shipping_zone_id").references(
			() => shippingZones.id,
		),
	},
	(t) => [
		oneOf("store_payment_methods_method", t.method, PAYMENT_METHODS),
		check(
			"store_payment_methods_max_total",
			sql`${t.maxTotal} is null or ${t.maxTotal} > 0`,
		),
	],
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
export const pages = sqliteTable(
	"pages",
	{
		id: id(),
		slug: text("slug").notNull().unique(),
		isPublished: integer("is_published", { mode: "boolean" })
			.notNull()
			.default(false),
		footerPosition: integer("footer_position"),
		updatedAt: updatedAt(),
	},
	(t) => [
		check(
			"pages_footer_position",
			sql`${t.footerPosition} is null or ${t.footerPosition} > 0`,
		),
		uniqueIndex("pages_footer_position_unique")
			.on(t.footerPosition)
			.where(sql`footer_position is not null`),
	],
);

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
		coversRest: integer("covers_rest", { mode: "boolean" })
			.notNull()
			.default(false),
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
		check("shipping_zones_fee", sql`${t.fee} >= 0`),
		check(
			"shipping_zones_days",
			sql`${t.deliveryDaysMin} >= 0 and ${t.deliveryDaysMax} >= ${t.deliveryDaysMin}`,
		),
		uniqueIndex("shipping_zones_one_rest")
			.on(t.coversRest)
			.where(sql`covers_rest = 1 and status = 'active'`),
	],
);

export const shippingZoneMunicipalities = sqliteTable(
	"shipping_zone_municipalities",
	{
		municipality: text("municipality").primaryKey(),
		zoneId: integer("zone_id")
			.notNull()
			.references(() => shippingZones.id),
	},
	(t) => [
		check(
			"shipping_zone_municipalities_known",
			sql`${t.municipality} in (${sql.raw(SV_MUNICIPALITIES.map((m) => `'${m}'`).join(", "))})`,
		),
		index("shipping_zone_municipalities_zone_idx").on(t.zoneId),
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
