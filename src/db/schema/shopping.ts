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
import { REVIEW_STATUSES } from "#/lib/enums";
import { createdAt, id, now, oneOf, updatedAt } from "./_helpers";
import { products, variants } from "./catalog";
import { customers } from "./customers";
import { bundles } from "./merchandising";

// The shopping cart. Its id is the random value of an httpOnly cookie; a guest cart has no
// customer and becomes the customer's at sign-in (merged into theirs if they have one). It
// stores no prices: every read prices it from the catalogue. The coupon is kept as typed
// (normalised) and evaluated on every read.
export const carts = sqliteTable(
	"carts",
	{
		id: text("id").primaryKey(),
		customerId: integer("customer_id").references(() => customers.id),
		promotionCode: text("promotion_code"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		check(
			"carts_id",
			sql`length(${t.id}) = 32 and ${t.id} not glob '*[^0-9a-f]*'`,
		),
		uniqueIndex("carts_customer_unique")
			.on(t.customerId)
			.where(sql`customer_id is not null`),
	],
);

// One line per variant or per set, never both.
export const cartItems = sqliteTable(
	"cart_items",
	{
		id: id(),
		cartId: text("cart_id")
			.notNull()
			.references(() => carts.id),
		variantId: integer("variant_id").references(() => variants.id),
		bundleId: integer("bundle_id").references(() => bundles.id),
		quantity: integer("quantity").notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		check("cart_items_quantity", sql`${t.quantity} > 0`),
		check(
			"cart_items_one_kind",
			sql`(${t.variantId} is null) <> (${t.bundleId} is null)`,
		),
		uniqueIndex("cart_items_variant_unique")
			.on(t.cartId, t.variantId)
			.where(sql`variant_id is not null`),
		uniqueIndex("cart_items_bundle_unique")
			.on(t.cartId, t.bundleId)
			.where(sql`bundle_id is not null`),
	],
);

// Only a customer with a delivered order of the product may review it (trigger), once.
// Published once approved.
export const productReviews = sqliteTable(
	"product_reviews",
	{
		id: id(),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		customerId: integer("customer_id")
			.notNull()
			.references(() => customers.id),
		rating: integer("rating").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		status: text("status", { enum: REVIEW_STATUSES })
			.notNull()
			.default("pending"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		moderatedAt: text("moderated_at"),
	},
	(t) => [
		oneOf("product_reviews_status", t.status, REVIEW_STATUSES),
		check("product_reviews_rating", sql`${t.rating} between 1 and 5`),
		check(
			"product_reviews_text",
			sql`length(trim(${t.title})) between 1 and 120 and length(trim(${t.body})) between 1 and 2000`,
		),
		uniqueIndex("product_reviews_once").on(t.customerId, t.productId),
		index("product_reviews_product_idx").on(t.productId, t.status),
		index("product_reviews_status_idx").on(t.status, t.createdAt),
	],
);

export const wishlistItems = sqliteTable(
	"wishlist_items",
	{
		customerId: integer("customer_id")
			.notNull()
			.references(() => customers.id),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id),
		createdAt: createdAt(),
	},
	(t) => [
		primaryKey({ columns: [t.customerId, t.productId] }),
		index("wishlist_items_product_idx").on(t.productId),
	],
);

// A request to hear when a sold-out size is back. The store has no email sender: staff
// export the pending ones, write to them and mark them notified.
export const stockAlerts = sqliteTable(
	"stock_alerts",
	{
		id: id(),
		variantId: integer("variant_id")
			.notNull()
			.references(() => variants.id),
		email: text("email").notNull(),
		createdAt: text("created_at").notNull().default(now),
		notifiedAt: text("notified_at"),
	},
	(t) => [
		check(
			"stock_alerts_email",
			sql`${t.email} = lower(trim(${t.email})) and ${t.email} like '%_@_%._%'`,
		),
		uniqueIndex("stock_alerts_pending_unique")
			.on(t.variantId, t.email)
			.where(sql`notified_at is null`),
		index("stock_alerts_variant_idx").on(t.variantId, t.notifiedAt),
	],
);
