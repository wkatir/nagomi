import { sql } from "drizzle-orm";
import {
	check,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { PROMOTION_STATUSES, PROMOTION_TYPES } from "#/lib/enums";
import { createdAt, id, isDate, locale, oneOf, updatedAt } from "./_helpers";

// A discount code applied to an order's subtotal when the order is placed. Dates are local
// calendar days of the store (both included). Usage counts the orders that used the code
// and were not cancelled; per customer they are matched by phone. Once an order used it,
// the code and its terms (type, value, minimum) never change (trigger), so an order's
// discount can always be derived from them.
export const promotions = sqliteTable(
	"promotions",
	{
		id: id(),
		// Stored in capitals; customers type it in any case.
		code: text("code").notNull().unique(),
		type: text("type", { enum: PROMOTION_TYPES }).notNull(),
		// percentage: whole percent (1-100); fixed: minor units off the subtotal.
		value: integer("value").notNull(),
		// Subtotal the order must reach. Null: any.
		minSubtotal: integer("min_subtotal"),
		startsOn: text("starts_on"),
		endsOn: text("ends_on"),
		// Orders that may use it in total, and per customer phone. Null: no limit.
		usageLimit: integer("usage_limit"),
		perCustomerLimit: integer("per_customer_limit"),
		status: text("status", { enum: PROMOTION_STATUSES })
			.notNull()
			.default("inactive"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("promotions_type", t.type, PROMOTION_TYPES),
		oneOf("promotions_status", t.status, PROMOTION_STATUSES),
		check(
			"promotions_code",
			sql`length(${t.code}) between 3 and 32 and ${t.code} not glob '*[^A-Z0-9_-]*'`,
		),
		check(
			"promotions_value",
			sql`(${t.type} = 'percentage' and ${t.value} between 1 and 100) or (${t.type} = 'fixed' and ${t.value} > 0)`,
		),
		check(
			"promotions_limits",
			sql`(${t.minSubtotal} is null or ${t.minSubtotal} > 0) and (${t.usageLimit} is null or ${t.usageLimit} > 0) and (${t.perCustomerLimit} is null or ${t.perCustomerLimit} > 0)`,
		),
		check(
			"promotions_dates",
			sql`(${t.startsOn} is null or ${isDate(t.startsOn)}) and (${t.endsOn} is null or ${isDate(t.endsOn)}) and (${t.startsOn} is null or ${t.endsOn} is null or ${t.startsOn} <= ${t.endsOn})`,
		),
	],
);

export const promotionTranslations = sqliteTable(
	"promotion_translations",
	{
		promotionId: integer("promotion_id")
			.notNull()
			.references(() => promotions.id),
		locale: locale(),
		description: text("description").notNull(),
	},
	(t) => [primaryKey({ columns: [t.promotionId, t.locale] })],
);
