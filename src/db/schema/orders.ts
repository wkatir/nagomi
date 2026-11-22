import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
	ORDER_CHANNELS,
	ORDER_STATUSES,
	PAYMENT_METHODS,
	RETURN_DISPOSITIONS,
	RETURN_REASONS,
	SHIPPING_METHODS,
} from "#/lib/enums";
import { actor, createdAt, id, isDate, locale, now, oneOf } from "./_helpers";
import { variants } from "./catalog";
import { customers } from "./customers";
import { PAYMENT_KINDS, PAYMENT_STATUSES } from "./enums";
import { lots } from "./inventory";
import { bundles } from "./merchandising";
import { promotions } from "./promotions";
import { shippingZones } from "./store";

// Placed with every term fixed (online checkout): prices, discount, shipping and payment
// method never change afterwards (trigger). Stock leaves the lots when the order is placed
// and comes back when it is cancelled.
export const orders = sqliteTable(
	"orders",
	{
		id: id(),
		code: text("code").notNull().unique(),
		// Retries of the same request return this order; another body with the key is a 422.
		idempotencyKey: text("idempotency_key").notNull().unique(),
		requestHash: text("request_hash").notNull(),
		customerId: integer("customer_id").references(() => customers.id),
		customerName: text("customer_name").notNull(),
		// Lower case, trimmed: guest lookup and once-per-customer coupons.
		customerEmail: text("customer_email").notNull(),
		// E.164 (+503 and 8 digits).
		customerPhone: text("customer_phone").notNull(),
		// searchKey() of code, customer name, email and phone digits (src/server/domain/search.ts).
		searchKey: text("search_key").notNull(),
		locale: locale(),
		channel: text("channel", { enum: ORDER_CHANNELS }).notNull(),
		status: text("status", { enum: ORDER_STATUSES })
			.notNull()
			.default("pending"),
		paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
		subtotal: integer("subtotal").notNull(),
		discount: integer("discount").notNull().default(0),
		discountReason: text("discount_reason"),
		shipping: integer("shipping").notNull().default(0),
		total: integer("total").notNull(),
		// The IVA included in the total at the store's rate when the order was placed.
		taxIncluded: integer("tax_included").notNull().default(0),
		shippingMethod: text("shipping_method", {
			enum: SHIPPING_METHODS,
		}).notNull(),
		shippingZoneId: integer("shipping_zone_id").references(
			() => shippingZones.id,
		),
		// Zone name in the order's locale when it was placed.
		shippingZoneName: text("shipping_zone_name"),
		shipDepartment: text("ship_department"),
		shipMunicipality: text("ship_municipality"),
		shipAddressLine: text("ship_address_line"),
		shipReference: text("ship_reference"),
		// Promised delivery as local dates; a single day has from = to.
		deliveryEstimateFrom: text("delivery_estimate_from"),
		deliveryEstimateTo: text("delivery_estimate_to"),
		// The summary the customer saw when placing the order (consumer law).
		confirmationMessage: text("confirmation_message").notNull(),
		// The hosted payment page of a card order (Wompi payment link).
		paymentUrl: text("payment_url"),
		courier: text("courier"),
		trackingCode: text("tracking_code"),
		cancelReason: text("cancel_reason"),
		cancelledBy: actor("cancelled_by"),
		notes: text("notes"),
		createdAt: createdAt(),
		paidAt: text("paid_at"),
		shippedAt: text("shipped_at"),
		deliveredAt: text("delivered_at"),
		cancelledAt: text("cancelled_at"),
		promotionId: integer("promotion_id").references(() => promotions.id),
	},
	(t) => [
		oneOf("orders_channel", t.channel, ORDER_CHANNELS),
		oneOf("orders_status", t.status, ORDER_STATUSES),
		oneOf("orders_payment_method", t.paymentMethod, PAYMENT_METHODS),
		oneOf("orders_shipping_method", t.shippingMethod, SHIPPING_METHODS),
		check(
			"orders_customer_phone",
			sql`${t.customerPhone} glob '+503[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`,
		),
		check(
			"orders_customer_email",
			sql`${t.customerEmail} = lower(trim(${t.customerEmail})) and ${t.customerEmail} like '%_@_%._%'`,
		),
		check("orders_customer_name", sql`trim(${t.customerName}) <> ''`),
		check(
			"orders_total_consistent",
			sql`${t.total} = ${t.subtotal} - ${t.discount} + ${t.shipping}`,
		),
		check(
			"orders_amounts_non_negative",
			sql`${t.subtotal} >= 0 and ${t.discount} >= 0 and ${t.discount} <= ${t.subtotal} and ${t.shipping} >= 0 and ${t.taxIncluded} >= 0 and ${t.taxIncluded} <= ${t.total}`,
		),
		check(
			"orders_discount_reason",
			sql`${t.discount} = 0 or ${t.discountReason} is not null`,
		),
		check(
			"orders_delivery_address",
			sql`${t.shippingMethod} = 'pickup' or (${t.shipMunicipality} is not null and ${t.shipDepartment} is not null and trim(${t.shipAddressLine}) <> '' and ${t.shippingZoneId} is not null)`,
		),
		check(
			"orders_delivery_estimate",
			sql`(${t.deliveryEstimateFrom} is null) = (${t.deliveryEstimateTo} is null) and (${t.deliveryEstimateFrom} is null or (${isDate(t.deliveryEstimateFrom)} and ${isDate(t.deliveryEstimateTo)} and ${t.deliveryEstimateFrom} <= ${t.deliveryEstimateTo}))`,
		),
		check(
			"orders_shipped_courier",
			sql`${t.shippedAt} is null or trim(${t.courier}) <> ''`,
		),
		index("orders_status_created_idx").on(t.status, t.createdAt),
		index("orders_customer_created_idx").on(t.customerId, t.createdAt),
		index("orders_created_idx").on(t.createdAt),
		index("orders_shipped_idx").on(t.shippedAt),
		index("orders_paid_idx").on(t.paidAt),
		index("orders_promotion_idx").on(t.promotionId),
		index("orders_customer_email_idx").on(t.customerEmail),
		index("orders_customer_phone_idx").on(t.customerPhone),
	],
);

// A set sold as one line at the set's price. Its units are order_items rows pointing here,
// priced so they add up to the set's price.
export const orderBundles = sqliteTable(
	"order_bundles",
	{
		id: id(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id),
		bundleId: integer("bundle_id")
			.notNull()
			.references(() => bundles.id),
		quantity: integer("quantity").notNull(),
		unitPrice: integer("unit_price").notNull(),
		// In the order's locale.
		name: text("name").notNull(),
	},
	(t) => [
		uniqueIndex("order_bundles_unique").on(t.orderId, t.bundleId),
		check("order_bundles_quantity", sql`${t.quantity} > 0`),
		check("order_bundles_unit_price", sql`${t.unitPrice} >= 0`),
	],
);

// One line per variant (and per set it came in). Description and price are copied when the
// order is placed, so later catalogue edits never rewrite what was sold.
export const orderItems = sqliteTable(
	"order_items",
	{
		id: id(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id),
		variantId: integer("variant_id")
			.notNull()
			.references(() => variants.id),
		orderBundleId: integer("order_bundle_id").references(() => orderBundles.id),
		quantity: integer("quantity").notNull(),
		unitPrice: integer("unit_price").notNull(),
		sku: text("sku").notNull(),
		brandName: text("brand_name").notNull(),
		// In the store's default locale.
		productName: text("product_name").notNull(),
		optionLabel: text("option_label"),
	},
	(t) => [
		uniqueIndex("order_items_unique")
			.on(t.orderId, t.variantId)
			.where(sql`order_bundle_id is null`),
		uniqueIndex("order_items_bundle_unique")
			.on(t.orderBundleId, t.variantId)
			.where(sql`order_bundle_id is not null`),
		index("order_items_order_idx").on(t.orderId),
		index("order_items_variant_idx").on(t.variantId),
		check("order_items_quantity_positive", sql`${t.quantity} > 0`),
		check("order_items_unit_price", sql`${t.unitPrice} >= 0`),
	],
);

export const orderStatusHistory = sqliteTable(
	"order_status_history",
	{
		id: id(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id),
		fromStatus: text("from_status", { enum: ORDER_STATUSES }),
		toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
		// The order's own timestamp of the change (triggers copy it).
		changedAt: text("changed_at").notNull().default(now),
	},
	(t) => [
		oneOf("order_status_history_from", t.fromStatus, ORDER_STATUSES),
		oneOf("order_status_history_to", t.toStatus, ORDER_STATUSES),
		check(
			"order_status_history_changed",
			sql`${t.fromStatus} is not ${t.toStatus}`,
		),
		index("order_status_history_order_idx").on(t.orderId, t.id),
	],
);

// Money in (kind 'payment') and back out (kind 'refund'), always positive amounts. Only
// confirmed rows count; the order's payment status is derived from them
// (src/server/domain/payments.ts). A row is final once it leaves 'pending'.
export const payments = sqliteTable(
	"payments",
	{
		id: id(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id),
		kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
		method: text("method", { enum: PAYMENT_METHODS }).notNull(),
		amount: integer("amount").notNull(),
		status: text("status", { enum: PAYMENT_STATUSES }).notNull(),
		// Bank transfer reference, receipt number or note to reconcile it.
		reference: text("reference"),
		providerTransactionId: text("provider_transaction_id").unique(),
		returnId: integer("return_id").references(() => returns.id),
		recordedAt: text("recorded_at").notNull().default(now),
		recordedBy: actor("recorded_by").notNull(),
	},
	(t) => [
		oneOf("payments_kind", t.kind, PAYMENT_KINDS),
		oneOf("payments_method", t.method, PAYMENT_METHODS),
		oneOf("payments_status", t.status, PAYMENT_STATUSES),
		check("payments_amount_positive", sql`${t.amount} > 0`),
		check(
			"payments_return_is_refund",
			sql`${t.returnId} is null or ${t.kind} = 'refund'`,
		),
		index("payments_order_idx").on(t.orderId),
		index("payments_kind_recorded_idx").on(t.kind, t.recordedAt),
	],
);

// Units that came back from a shipped or delivered order. A refund is a payments row.
export const returns = sqliteTable(
	"returns",
	{
		id: id(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id),
		reason: text("reason", { enum: RETURN_REASONS }).notNull(),
		note: text("note"),
		createdAt: createdAt(),
		createdBy: actor("created_by").notNull(),
	},
	(t) => [
		oneOf("returns_reason", t.reason, RETURN_REASONS),
		index("returns_order_idx").on(t.orderId),
		index("returns_created_idx").on(t.createdAt),
	],
);

// Per lot the unit left from: restock puts it back in that lot, write_off records it as
// waste (opened, damaged or expired).
export const returnLines = sqliteTable(
	"return_lines",
	{
		id: id(),
		returnId: integer("return_id")
			.notNull()
			.references(() => returns.id),
		orderItemId: integer("order_item_id")
			.notNull()
			.references(() => orderItems.id),
		lotId: integer("lot_id")
			.notNull()
			.references(() => lots.id),
		quantity: integer("quantity").notNull(),
		disposition: text("disposition", { enum: RETURN_DISPOSITIONS }).notNull(),
	},
	(t) => [
		oneOf("return_lines_disposition", t.disposition, RETURN_DISPOSITIONS),
		check("return_lines_quantity", sql`${t.quantity} > 0`),
		index("return_lines_return_idx").on(t.returnId),
		index("return_lines_order_item_idx").on(t.orderItemId, t.lotId),
	],
);
