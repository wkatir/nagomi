import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import { actor, createdAt, id, isDate, oneOf, updatedAt } from "./_helpers";
import { variants } from "./catalog";
import { PURCHASE_ORDER_STATUSES } from "./enums";

// Archived suppliers keep their purchase orders; new ones need an active supplier.
export const suppliers = sqliteTable(
	"suppliers",
	{
		id: id(),
		name: text("name").notNull().unique(),
		contactName: text("contact_name"),
		searchKey: text("search_key").notNull(),
		phoneE164: text("phone_e164"),
		email: text("email"),
		paymentTerms: text("payment_terms"),
		// Days from placing an order to having the units in stock. Null: not known yet.
		leadTimeDays: integer("lead_time_days"),
		notes: text("notes"),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("suppliers_status", t.status, ARCHIVABLE_STATUSES),
		check(
			"suppliers_lead_time",
			sql`${t.leadTimeDays} is null or ${t.leadTimeDays} >= 0`,
		),
		check(
			"suppliers_phone_e164",
			sql`${t.phoneE164} is null or (${t.phoneE164} glob '+[1-9][0-9]*' and length(${t.phoneE164}) between 8 and 16)`,
		),
	],
);

// Orders are whole packs. One row per supplier and variant, archived instead of deleted; at
// most one active row per variant is the preferred source.
export const supplierItems = sqliteTable(
	"supplier_items",
	{
		id: id(),
		supplierId: integer("supplier_id")
			.notNull()
			.references(() => suppliers.id),
		variantId: integer("variant_id")
			.notNull()
			.references(() => variants.id),
		supplierSku: text("supplier_sku"),
		// Units per pack. Null: sold by the unit, or not known yet.
		packSize: integer("pack_size"),
		// Fewest units per order. Null: no minimum, or not known yet.
		minOrderQuantity: integer("min_order_quantity"),
		isPreferred: integer("is_preferred", { mode: "boolean" })
			.notNull()
			.default(false),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("supplier_items_status", t.status, ARCHIVABLE_STATUSES),
		check(
			"supplier_items_quantities",
			sql`(${t.packSize} is null or ${t.packSize} > 0) and (${t.minOrderQuantity} is null or ${t.minOrderQuantity} > 0)`,
		),
		check(
			"supplier_items_sku",
			sql`${t.supplierSku} is null or trim(${t.supplierSku}) <> ''`,
		),
		uniqueIndex("supplier_items_unique").on(t.supplierId, t.variantId),
		uniqueIndex("supplier_items_preferred")
			.on(t.variantId)
			.where(sql`is_preferred = 1 and status = 'active'`),
		index("supplier_items_variant_idx").on(t.variantId),
	],
);

export const purchaseOrders = sqliteTable(
	"purchase_orders",
	{
		id: id(),
		supplierId: integer("supplier_id")
			.notNull()
			.references(() => suppliers.id),
		reference: text("reference").notNull(),
		status: text("status", { enum: PURCHASE_ORDER_STATUSES })
			.notNull()
			.default("draft"),
		// Whether unit costs include sales tax. Null = not confirmed by the supplier yet.
		taxIncluded: integer("tax_included", { mode: "boolean" }),
		notes: text("notes"),
		orderedOn: text("ordered_on"),
		cancelledAt: text("cancelled_at"),
		createdAt: createdAt(),
		createdBy: actor("created_by"),
	},
	(t) => [
		oneOf("purchase_orders_status", t.status, PURCHASE_ORDER_STATUSES),
		check(
			"purchase_orders_ordered_on",
			sql`${t.orderedOn} is null or ${isDate(t.orderedOn)}`,
		),
		check(
			"purchase_orders_ordered",
			sql`${t.status} in ('draft', 'cancelled') or ${t.orderedOn} is not null`,
		),
		check(
			"purchase_orders_notes",
			sql`${t.notes} is null or trim(${t.notes}) <> ''`,
		),
		// A cancelled purchase order frees its reference.
		uniqueIndex("purchase_orders_supplier_reference")
			.on(t.supplierId, t.reference)
			.where(sql`status <> 'cancelled'`),
		index("purchase_orders_status_idx").on(t.status),
	],
);

// Several lines may share a variant (e.g. free units at cost 0 on their own line).
export const purchaseOrderItems = sqliteTable(
	"purchase_order_items",
	{
		id: id(),
		purchaseOrderId: integer("purchase_order_id")
			.notNull()
			.references(() => purchaseOrders.id),
		variantId: integer("variant_id")
			.notNull()
			.references(() => variants.id),
		quantity: integer("quantity").notNull(),
		// Minor units, before landed cost.
		unitCost: integer("unit_cost").notNull(),
	},
	(t) => [
		index("purchase_order_items_po_idx").on(t.purchaseOrderId),
		index("purchase_order_items_variant_idx").on(t.variantId),
		check("purchase_order_items_quantity_positive", sql`${t.quantity} > 0`),
		check("purchase_order_items_cost_non_negative", sql`${t.unitCost} >= 0`),
	],
);

// Its shipping cost is spread over its lines by value.
export const purchaseReceipts = sqliteTable(
	"purchase_receipts",
	{
		id: id(),
		purchaseOrderId: integer("purchase_order_id")
			.notNull()
			.references(() => purchaseOrders.id),
		receivedOn: text("received_on").notNull(),
		supplierInvoiceRef: text("supplier_invoice_ref"),
		shippingCost: integer("shipping_cost").notNull().default(0),
		notes: text("notes"),
		createdAt: createdAt(),
		createdBy: actor("created_by").notNull(),
	},
	(t) => [
		index("purchase_receipts_po_idx").on(t.purchaseOrderId),
		check("purchase_receipts_received_on", isDate(t.receivedOn)),
		check("purchase_receipts_shipping", sql`${t.shippingCost} >= 0`),
	],
);

export const purchaseReceiptLines = sqliteTable(
	"purchase_receipt_lines",
	{
		id: id(),
		receiptId: integer("receipt_id")
			.notNull()
			.references(() => purchaseReceipts.id),
		purchaseOrderItemId: integer("purchase_order_item_id")
			.notNull()
			.references(() => purchaseOrderItems.id),
		quantity: integer("quantity").notNull(),
		// This line's share of the receipt shipping cost, in 1/10,000 currency units.
		allocatedShippingE4: integer("allocated_shipping_e4").notNull(),
	},
	(t) => [
		index("purchase_receipt_lines_receipt_idx").on(t.receiptId),
		index("purchase_receipt_lines_item_idx").on(t.purchaseOrderItemId),
		check("purchase_receipt_lines_quantity", sql`${t.quantity} > 0`),
		check(
			"purchase_receipt_lines_shipping",
			sql`${t.allocatedShippingE4} >= 0`,
		),
	],
);
