// Conventions
// - Money is integer minor units of the store currency (store_settings.currency; cents
//   for USD; the number of decimals comes from Intl). Lot costs are integer hundredths of
//   a minor unit (`*_e4`) so landed cost can be spread over units; reports round to minor
//   units. The currency cannot change once orders or purchase orders exist.
// - Stock is never stored: it is the sum of inventory_movements per lot. The ledger is
//   append-only and a lot balance can never go below zero (triggers in drizzle/).
// - Customer-facing text lives in *_translations tables keyed by (entity, locale).
// - Instants are ISO-8601 UTC strings produced by SQLite (`now`). Calendar dates
//   (YYYY-MM-DD: ordered/received on, delivery estimate) and every "day" shown
//   or grouped are in store_settings.time_zone.
// - Every enum is a CHECK in the table, except `locale` (only page_versions has one; the
//   API validates the others). Business records are never deleted: no foreign
//   key cascades, DELETE is refused by triggers (lines of pending orders and draft purchase
//   orders excepted), catalogue entities are archived instead.
// - Business rules and thresholds live in store_settings, never in code. After the first
//   production migration, changes are additive only: new tables, indexes and triggers, or
//   ALTER TABLE ADD COLUMN that is nullable or has a constant default (a default such as
//   `now` fails on D1). Read every generated SQL file: no `__new_` rebuilds, DROP TABLE or
//   PRAGMA foreign_keys (see app/README.md, Migrations).

export {
	ARCHIVABLE_STATUSES,
	LOCALES,
	type Locale,
	MOVEMENT_REASONS,
	type MovementReason,
	ORDER_CHANNELS,
	ORDER_PAYMENT_STATUSES,
	ORDER_STATUSES,
	type OrderChannel,
	type OrderPaymentStatus,
	type OrderStatus,
	PAYMENT_METHODS,
	type PaymentMethod,
	PROMOTION_STATUSES,
	PROMOTION_TYPES,
	type PromotionType,
	RETURN_DISPOSITIONS,
	RETURN_REASONS,
	type ReturnDisposition,
	type ReturnReason,
	SHIPPING_METHODS,
	type ShippingMethod,
	SLUG_REGEX,
} from "#/lib/enums";
export { now } from "./_helpers";
export * from "./audit";
export * from "./catalog";
export * from "./customers";
export * from "./enums";
export * from "./inventory";
export * from "./merchandising";
export * from "./orders";
export * from "./promotions";
export * from "./purchasing";
export * from "./store";
