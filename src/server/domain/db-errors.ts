// Database refusals that are answers, not bugs: trigger aborts (RAISE(ABORT, '<code>') in
// drizzle/0001_integrity_triggers.sql) and unique keys a request can collide with. Anything
// else stays a 500.
export const DB_ERRORS = {
	lot_balance_negative: "stock_changed",
	// Backstop of the stock rule (orders_confirm_within_stock): the API refuses first, with what is left.
	order_exceeds_stock: "insufficient_stock",
	// Reachable by concurrent requests on the same order: the loser's batch rolls back.
	order_not_confirmed: "invalid_transition",
	sale_exceeds_order_line: "invalid_transition",
	order_units_not_returned: "invalid_transition",
	invalid_order_transition: "invalid_transition",
	order_terms_locked: "invalid_transition",
	order_items_locked: "invalid_transition",
	invalid_purchase_order_transition: "invalid_transition",
	purchase_order_items_locked: "purchase_order_not_open",
	purchase_order_not_open: "purchase_order_not_open",
	receipt_exceeds_ordered: "receipt_exceeds_ordered",
	return_requires_shipped_order: "invalid_transition",
	return_exceeds_sold: "return_exceeds_sold",
	refund_exceeds_paid: "refund_exceeds_paid",
	payment_is_final: "payment_is_final",
	published_product_requires_price: "publish_requires_price",
	published_variant_requires_price: "publish_requires_price",
	order_has_no_lines: "order_has_no_lines",
	lot_expiry_locked: "lot_expiry_locked",
	supplier_archived: "supplier_archived",
	image_variant_mismatch: "variant_not_in_product",
	// Checked again when the order is written, for concurrent orders.
	promotion_inactive: "promotion_unavailable",
	promotion_usage_limit: "promotion_limit_reached",
	promotion_customer_limit: "promotion_limit_reached",
	// The code's terms changed between reading it and writing the order.
	promotion_discount_mismatch: "promotion_changed",
	promotion_terms_locked: "promotion_in_use",
	order_promotion_locked: "invalid_transition",
	collection_product_archived: "reference_unavailable",
} as const;

const UNIQUE_KEYS = {
	"purchase_orders.supplier_id, purchase_orders.reference":
		"duplicate_reference",
	"customers.phone_e164": "duplicate_phone",
	"products.slug": "duplicate_slug",
	"brands.slug": "duplicate_slug",
	"categories.slug": "duplicate_slug",
	"concerns.slug": "duplicate_slug",
	"routines.slug": "duplicate_slug",
	"collections.slug": "duplicate_slug",
	"shipping_zones.slug": "duplicate_slug",
	"promotions.code": "duplicate_code",
	"variants.sku": "duplicate_sku",
	"variants.gtin": "duplicate_gtin",
	"suppliers.name": "duplicate_name",
	"product_images.product_id, product_images.media_file_id": "duplicate_image",
	"supplier_items.supplier_id, supplier_items.variant_id":
		"duplicate_supplier_item",
	// Partial unique index: one preferred active supplier per variant.
	"supplier_items.variant_id": "preferred_supplier_taken",
} as const;

export const DB_ERROR_CODES = [
	...new Set([...Object.values(DB_ERRORS), ...Object.values(UNIQUE_KEYS)]),
];

type MappedDbError = {
	status: 409;
	error:
		| (typeof DB_ERRORS)[keyof typeof DB_ERRORS]
		| (typeof UNIQUE_KEYS)[keyof typeof UNIQUE_KEYS];
	cause: string;
};

const TRIGGER_CODE = new RegExp(
	`(?:^|[^a-z_])(${Object.keys(DB_ERRORS).join("|")})(?:[^a-z_]|$)`,
);
const UNIQUE_FAILED =
	/UNIQUE constraint failed: ([a-z0-9_.]+(?:, [a-z0-9_.]+)*)/;

function messages(err: unknown): string[] {
	const out: string[] = [];
	for (let e = err; e instanceof Error && out.length < 10; e = e.cause)
		out.push(e.message);
	return out;
}

// D1 puts the trigger code or constraint in the message of the Error or of a cause; a failed
// statement in a batch rolls the whole batch back.
export function mapDbError(err: unknown): MappedDbError | null {
	for (const message of messages(err)) {
		const trigger = TRIGGER_CODE.exec(message)?.[1] as
			| keyof typeof DB_ERRORS
			| undefined;
		if (trigger)
			return { status: 409, error: DB_ERRORS[trigger], cause: trigger };
		const unique = UNIQUE_FAILED.exec(message)?.[1];
		if (unique && unique in UNIQUE_KEYS)
			return {
				status: 409,
				error: UNIQUE_KEYS[unique as keyof typeof UNIQUE_KEYS],
				cause: `unique ${unique}`,
			};
	}
	return null;
}
