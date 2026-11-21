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
import { PAYMENT_KINDS, PAYMENT_STATUSES, SIZE_UNITS } from "./enums";
import { lots } from "./inventory";
import { promotions } from "./promotions";
import { shippingZones } from "./store";

export const orders = sqliteTable(
	"orders",
	{
		id: id(),
		code: text("code").notNull().unique(),
		// Retries of the same request return this order; another body with the key is a 422.
		idempotencyKey: text("idempotency_key").notNull().unique(),
		requestHash: text("request_hash").notNull(),
		customerId: integer("customer_id").references(() => customers.id),
		// The name given with this order (a gift buyer may not be the stored customer).
		customerName: text("customer_name"),
		// searchKey() of code and customer name (src/server/domain/search.ts), written by the API.
		searchKey: text("search_key").notNull(),
		locale: locale(),
		channel: text("channel", { enum: ORDER_CHANNELS }).notNull(),
		status: text("status", { enum: ORDER_STATUSES })
			.notNull()
			.default("pending"),
		// Method agreed at confirmation; money received is in `payments`.
		paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }),
		subtotal: integer("subtotal").notNull(),
		discount: integer("discount").notNull().default(0),
		discountReason: text("discount_reason"),
		// Fixed at confirmation.
		shipping: integer("shipping").notNull().default(0),
		total: integer("total").notNull(),
		shippingMethod: text("shipping_method", { enum: SHIPPING_METHODS }),
		shippingZoneId: integer("shipping_zone_id").references(
			() => shippingZones.id,
		),
		// Zone name in the default locale at confirmation.
		shippingZoneName: text("shipping_zone_name"),
		shipTo: text("ship_to"),
		// Promised delivery as local dates; a single day has from = to.
		deliveryEstimateFrom: text("delivery_estimate_from"),
		deliveryEstimateTo: text("delivery_estimate_to"),
		// Exactly what was sent to the customer at confirmation (consumer law).
		confirmationMessage: text("confirmation_message"),
		cancelReason: text("cancel_reason"),
		notes: text("notes"),
		createdAt: createdAt(),
		confirmedAt: text("confirmed_at"),
		fulfilledAt: text("fulfilled_at"),
		deliveredAt: text("delivered_at"),
		cancelledAt: text("cancelled_at"),
		// The discount code used when the order was placed; its discount is `discount`, with
		// the code as `discount_reason`. It may only be removed, while pending (trigger).
		promotionId: integer("promotion_id").references(() => promotions.id),
		// The phone given with the order (E.164), for order lookup and per-customer
		// promotion limits; the customer is linked at confirmation. Never changes (trigger).
		customerPhone: text("customer_phone"),
	},
	(t) => [
		oneOf("orders_channel", t.channel, ORDER_CHANNELS),
		oneOf("orders_status", t.status, ORDER_STATUSES),
		oneOf("orders_payment_method", t.paymentMethod, PAYMENT_METHODS),
		check(
			"orders_customer_phone",
			sql`${t.customerPhone} is null or (${t.customerPhone} glob '+[1-9]*' and substr(${t.customerPhone}, 2) not glob '*[^0-9]*' and length(${t.customerPhone}) between 8 and 16)`,
		),
		oneOf("orders_shipping_method", t.shippingMethod, SHIPPING_METHODS),
		check(
			"orders_total_consistent",
			sql`${t.total} = ${t.subtotal} - ${t.discount} + ${t.shipping}`,
		),
		check(
			"orders_amounts_non_negative",
			sql`${t.subtotal} >= 0 and ${t.discount} >= 0 and ${t.discount} <= ${t.subtotal} and ${t.shipping} >= 0`,
		),
		check(
			"orders_discount_reason",
			sql`${t.discount} = 0 or ${t.discountReason} is not null`,
		),
		check(
			"orders_delivery_estimate",
			sql`(${t.deliveryEstimateFrom} is null) = (${t.deliveryEstimateTo} is null) and (${t.deliveryEstimateFrom} is null or (${isDate(t.deliveryEstimateFrom)} and ${isDate(t.deliveryEstimateTo)} and ${t.deliveryEstimateFrom} <= ${t.deliveryEstimateTo}))`,
		),
		index("orders_status_created_idx").on(t.status, t.createdAt),
		index("orders_customer_created_idx").on(t.customerId, t.createdAt),
		index("orders_created_idx").on(t.createdAt),
		// Reports date sales by fulfilment and bookings by confirmation.
		index("orders_fulfilled_idx").on(t.fulfilledAt),
		index("orders_confirmed_idx").on(t.confirmedAt),
		index("orders_promotion_idx").on(t.promotionId),
		index("orders_customer_phone_idx").on(t.customerPhone),
	],
);

// One line per variant. Description and price are copied when the order is placed, so
// later catalogue edits never rewrite what was sold.
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
		quantity: integer("quantity").notNull(),
		unitPrice: integer("unit_price").notNull(),
		sku: text("sku").notNull(),
		brandName: text("brand_name").notNull(),
		// In the store's default locale.
		productName: text("product_name").notNull(),
		sizeValue: integer("size_value"),
		sizeUnit: text("size_unit", { enum: SIZE_UNITS }),
	},
	(t) => [
		uniqueIndex("order_items_unique").on(t.orderId, t.variantId),
		index("order_items_variant_idx").on(t.variantId),
		oneOf("order_items_size_unit", t.sizeUnit, SIZE_UNITS),
		check("order_items_quantity_positive", sql`${t.quantity} > 0`),
		check("order_items_unit_price", sql`${t.unitPrice} >= 0`),
		check(
			"order_items_size_pair",
			sql`(${t.sizeValue} is null) = (${t.sizeUnit} is null)`,
		),
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

// Units that came back from a fulfilled or delivered order. A refund is a payments row.
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
