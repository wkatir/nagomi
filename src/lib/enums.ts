// Values the browser, the API and the database share. They live here, not in db/schema,
// so the storefront and the back office never import the Drizzle table definitions.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const PAYMENT_METHODS = [
	"card",
	"bank_transfer",
	"cash_on_delivery",
	"payment_link",
	"cash",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPPING_METHODS = ["pickup", "own_delivery", "courier"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

// pending (stock taken, awaiting payment) -> paid -> shipped -> delivered (final); cash on
// delivery goes pending -> shipped. Cancelled only from pending or paid.
export const ORDER_STATUSES = [
	"pending",
	"paid",
	"shipped",
	"delivered",
	"cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MOVEMENT_REASONS = [
	"damaged",
	"demo_unit",
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

export const CATEGORY_ICONS = [
	"keyboard",
	"mouse",
	"square",
	"headphones",
	"lightbulb",
	"package",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const PRODUCT_BADGES = ["best_seller", "new"] as const;
export type ProductBadge = (typeof PRODUCT_BADGES)[number];

export const SKU_REGEX = /^[A-Z]{3}-[0-9]{3}$/;

export const IMAGE_KINDS = ["packshot", "lifestyle", "detail"] as const;

export const ORDER_CHANNELS = [
	"web",
	"whatsapp",
	"instagram",
	"in_person",
] as const;
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

export const RETURN_REASONS = [
	"withdrawal",
	"defective",
	"wrong_item",
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

// cancellation: units of a cancelled order put back in the lot they left.
export const MOVEMENT_KINDS = [
	"receive",
	"sale",
	"cancellation",
	"return",
	"adjustment",
	"waste",
] as const;

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CHECKOUT_PAYMENT_METHODS = [
	"card",
	"bank_transfer",
	"cash_on_delivery",
] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

export const CUSTOMER_SEGMENTS = [
	"new",
	"occasional",
	"frequent",
	"inactive",
] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];
