// Money is integer minor units; lot costs are `*_e4`, hundredths of a minor unit.
// After the first production migration, changes are additive only: no `__new_` rebuilds,
// DROP TABLE or PRAGMA foreign_keys, and ADD COLUMN only nullable or with a constant default
// (a `now` default fails on D1). See README.md, Migrations.

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
	REVIEW_STATUSES,
	type ReturnDisposition,
	type ReturnReason,
	type ReviewStatus,
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
export * from "./shopping";
export * from "./store";
