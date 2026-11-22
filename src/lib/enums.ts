// Values the browser, the API and the database share. They live here, not in db/schema,
// so the storefront and the back office never import the Drizzle table definitions.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const PAYMENT_METHODS = [
	"bank_transfer",
	"cash_on_delivery",
	"payment_link",
	"cash",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPPING_METHODS = ["pickup", "own_delivery", "courier"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const ORDER_STATUSES = [
	"pending",
	"confirmed",
	"fulfilled",
	"delivered",
	"cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MOVEMENT_REASONS = [
	"expired",
	"damaged",
	"sample_tester",
	"own_use",
	"lost_theft",
	"count_difference",
	"customer_return",
	"other",
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

// Same rule as slugCheck in the table.
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// archived keeps its history (orders reference its variants) but leaves every list.
export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

// Labels are messages (skin_type_*); the list is the standard one, so it is fixed like the
// other enums.
export const SKIN_TYPES = [
	"normal",
	"dry",
	"oily",
	"combination",
	"sensitive",
] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

export const SIZE_UNITS = ["ml", "g", "units"] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

export const IMAGE_KINDS = ["packshot", "lifestyle", "texture"] as const;

// The storefront places its orders through WhatsApp.
export const ORDER_CHANNELS = ["whatsapp", "instagram", "in_person"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

// Derived, never stored: see paymentSummary in the API.
export const ORDER_PAYMENT_STATUSES = [
	"unpaid",
	"partially_paid",
	"paid",
	"refund_due",
	"refunded",
	"nothing_due",
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

// delivery_failed is written by cancelling a shipped order, never typed.
export const RETURN_REASONS = [
	"withdrawal",
	"defective",
	"wrong_item",
	"delivery_failed",
	"other",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_DISPOSITIONS = ["restock", "write_off"] as const;
export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];

export const ARCHIVABLE_STATUSES = ["active", "archived"] as const;
export type ArchivableStatus = (typeof ARCHIVABLE_STATUSES)[number];

export const PROMOTION_TYPES = ["percentage", "fixed"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_STATUSES = ["active", "inactive", "archived"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

// draft -> ordered -> partially_received -> received; draft, ordered and
// partially_received can be cancelled (for partially_received: the rest will not come).
export const PURCHASE_ORDER_STATUSES = [
	"draft",
	"ordered",
	"partially_received",
	"received",
	"cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const MOVEMENT_KINDS = [
	"receive",
	"sale",
	"return",
	"adjustment",
	"waste",
] as const;
