import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { MOVEMENT_REASONS } from "#/lib/enums";
import { actor, createdAt, id, isDate, oneOf } from "./_helpers";
import { variants } from "./catalog";
import { EXPIRY_PRECISIONS, MOVEMENT_KINDS } from "./enums";
import { orderItems, returnLines } from "./orders";
import { purchaseReceiptLines } from "./purchasing";

// Stock is sold first-expired, first-out. A label that only prints the month ("EXP 2027.05")
// is stored as the last day of that month with precision 'month'.
export const lots = sqliteTable(
	"lots",
	{
		id: id(),
		variantId: integer("variant_id")
			.notNull()
			.references(() => variants.id),
		receiptLineId: integer("receipt_line_id")
			.notNull()
			.references(() => purchaseReceiptLines.id),
		code: text("code"),
		expiresOn: text("expires_on").notNull(),
		expiryPrecision: text("expiry_precision", { enum: EXPIRY_PRECISIONS })
			.notNull()
			.default("day"),
		// Landed unit cost (supplier price + shipping share) in 1/10,000 currency units.
		unitCostE4: integer("unit_cost_e4").notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		oneOf("lots_expiry_precision", t.expiryPrecision, EXPIRY_PRECISIONS),
		check("lots_expires_on", isDate(t.expiresOn)),
		check(
			"lots_month_precision",
			sql`${t.expiryPrecision} = 'day' or ${t.expiresOn} = date(${t.expiresOn}, 'start of month', '+1 month', '-1 day')`,
		),
		check("lots_unit_cost", sql`${t.unitCostE4} >= 0`),
		uniqueIndex("lots_receipt_line_unique").on(t.receiptLineId),
		index("lots_variant_expiry_idx").on(t.variantId, t.expiresOn),
	],
);

// Append-only ledger. A count is an adjustment with the reason count_difference.
export const inventoryMovements = sqliteTable(
	"inventory_movements",
	{
		id: id(),
		lotId: integer("lot_id")
			.notNull()
			.references(() => lots.id),
		kind: text("kind", { enum: MOVEMENT_KINDS }).notNull(),
		quantity: integer("quantity").notNull(),
		orderItemId: integer("order_item_id").references(() => orderItems.id),
		returnLineId: integer("return_line_id").references(() => returnLines.id),
		reason: text("reason", { enum: MOVEMENT_REASONS }),
		note: text("note"),
		createdAt: createdAt(),
		createdBy: actor("created_by").notNull(),
	},
	(t) => [
		oneOf("inventory_movements_kind", t.kind, MOVEMENT_KINDS),
		oneOf("inventory_movements_reason", t.reason, MOVEMENT_REASONS),
		index("inventory_movements_lot_idx").on(t.lotId),
		index("inventory_movements_order_item_idx").on(t.orderItemId),
		index("inventory_movements_return_line_idx").on(t.returnLineId),
		index("inventory_movements_created_idx").on(t.createdAt),
		check("inventory_movements_nonzero", sql`${t.quantity} <> 0`),
		check(
			"inventory_movements_sign",
			sql`(${t.kind} in ('receive', 'return') and ${t.quantity} > 0) or (${t.kind} in ('sale', 'waste') and ${t.quantity} < 0) or ${t.kind} = 'adjustment'`,
		),
		check(
			"inventory_movements_links",
			sql`(${t.kind} = 'sale') = (${t.orderItemId} is not null) and (${t.kind} = 'return' or (${t.kind} = 'waste' and ${t.reason} = 'customer_return')) = (${t.returnLineId} is not null)`,
		),
		check(
			"inventory_movements_reason_required",
			sql`${t.kind} not in ('waste', 'adjustment') or ${t.reason} is not null`,
		),
	],
);
