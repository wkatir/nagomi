import { m } from "#/paraglide/messages";
import { apiErrorOf } from "./api";

// A code the server can answer must be here, or in a case of errorMessage, or be listed in
// errors.test.ts as shown generically.
const MESSAGES: Record<string, () => string> = {
	product_unavailable: m.error_product_unavailable,
	variant_unavailable: m.error_variant_unavailable,
	checkout_not_configured: m.error_checkout_not_configured,
	store_not_configured: m.error_store_not_configured,
	promise_requires_return_window: m.error_promise_requires_return_window,
	publish_requires_price: m.error_publish_requires_price,
	publish_requires_default_translation:
		m.error_publish_requires_default_translation,
	discount_exceeds_subtotal: m.error_discount_exceeds_subtotal,
	invalid_transition: m.error_invalid_transition,
	stock_changed: m.error_stock_changed,
	receipt_exceeds_ordered: m.error_receipt_exceeds_ordered,
	return_exceeds_sold: m.error_return_exceeds_sold,
	return_lot_required: m.error_return_lot_required,
	refund_exceeds_paid: m.error_refund_exceeds_paid,
	payment_is_final: m.error_payment_is_final,
	idempotency_key_reused: m.error_idempotency_key_reused,
	payment_method_not_accepted: m.error_payment_method_not_accepted,
	invalid_phone: m.error_invalid_phone,
	duplicate_phone: m.error_duplicate_phone,
	duplicate_code: m.admin_promotion_error_duplicate_code,
	promotion_in_use: m.admin_promotion_error_in_use,
	shipping_fee_required: m.error_shipping_fee_required,
	shipping_zone_unavailable: m.error_shipping_zone_unavailable,
	purchase_order_not_open: m.error_purchase_order_not_open,
	item_not_in_purchase_order: m.error_item_not_in_purchase_order,
	duplicate_reference: m.error_duplicate_reference,
	delivery_estimate_in_past: m.error_delivery_estimate_in_past,
	shipping_fee_with_zone: m.error_shipping_fee_with_zone,
	order_subtotal_mismatch: m.error_order_subtotal_mismatch,
	refund_exceeds_refundable: m.error_refund_exceeds_refundable,
	rate_limited: m.error_rate_limited,
	payload_too_large: m.error_payload_too_large,
	currency_locked: m.error_currency_locked,
	default_locale_untranslated: m.error_default_locale_untranslated,
	received_on_in_future: m.error_received_on_in_future,
	received_before_ordered: m.error_received_before_ordered,
	duplicate_slug: m.error_duplicate_slug,
	duplicate_sku: m.error_duplicate_sku,
	duplicate_gtin: m.error_duplicate_gtin,
	duplicate_name: m.error_duplicate_name,
	duplicate_image: m.error_duplicate_image,
	slug_locked: m.error_slug_locked,
	sku_locked: m.error_sku_locked,
	reference_unavailable: m.error_reference_unavailable,
	in_use: m.error_in_use,
	unsupported_image_type: m.error_unsupported_image_type,
	image_too_large: m.error_image_too_large,
	invalid_image: m.error_invalid_image,
	bundle_requires_two_items: m.error_bundle_requires_two_items,
	bundle_item_unavailable: m.error_bundle_item_unavailable,
	bundle_price_not_below_items: m.error_bundle_price_not_below_items,
	bundles_are_archived: m.error_bundles_are_archived,
	price_history_append_only: m.error_price_history_append_only,
	spec_requires_default_translation: m.error_spec_requires_default_translation,
	unknown_shipping_zone: m.error_unknown_shipping_zone,
	zone_covers_rest: m.error_zone_covers_rest,
	municipality_in_other_zone: m.error_municipality_in_other_zone,
	no_shipping_zone: m.error_no_shipping_zone,
	duplicate_variant: m.error_duplicate_variant,
	duplicate_position: m.error_duplicate_position,
	store_not_ready: m.error_store_not_ready,
	duplicate_email: m.error_duplicate_email,
	phone_not_salvadoran: m.error_phone_not_salvadoran,
	address_archived: m.error_address_archived,
	customer_account_locked: m.error_customer_account_locked,
	customer_permanent: m.error_customer_permanent,
	invalid_email: m.error_invalid_email,
	unknown_role: m.error_unknown_role,
	collection_requires_products: m.error_collection_requires_products,
	variant_not_in_product: m.error_variant_not_in_product,
	images_changed: m.error_images_changed,
	slides_changed: m.error_slides_changed,
	order_has_no_lines: m.error_order_has_no_lines,
	supplier_archived: m.error_supplier_archived,
	image_alt_required: m.error_image_alt_required,
	supplier_item_archived: m.error_supplier_item_archived,
	nothing_to_order: m.admin_purchase_nothing_to_order,
	duplicate_supplier_item: m.admin_supplier_item_duplicate,
	preferred_supplier_taken: m.admin_supplier_item_preferred_taken,
	invalid_request: m.error_invalid_request,
	not_found: m.error_not_found,
	order_not_found: m.error_order_not_found,
	promotion_first_order_only: m.error_promotion_first_order_only,
	order_not_paid: m.error_order_not_paid,
	review_requires_delivered_order: m.error_review_requires_delivered_order,
	review_exists: m.error_review_exists,
	stock_alert_exists: m.error_stock_alert_exists,
	out_of_stock: m.error_out_of_stock,
	cart_empty: m.error_cart_empty,
	cart_changed: m.error_cart_changed,
	in_stock: m.error_in_stock,
	gateway_unavailable: m.error_gateway_unavailable,
	card_unavailable: m.error_card_unavailable,
	invalid_fields: m.error_invalid_fields,
	promotion_limit_reached: m.promotion_reason_usage_limit_reached,
	promotion_unavailable: m.promotion_reason_not_found,
	promotion_changed: m.error_cart_changed,
};

const PROMOTION_REASONS: Record<string, () => string> = {
	not_found: m.promotion_reason_not_found,
	promotion_unavailable: m.promotion_reason_not_found,
	not_started: m.promotion_reason_not_started,
	expired: m.promotion_reason_expired,
	usage_limit_reached: m.promotion_reason_usage_limit_reached,
	promotion_limit_reached: m.promotion_reason_customer_limit_reached,
	customer_limit_reached: m.promotion_reason_customer_limit_reached,
	first_order_only: m.promotion_reason_first_order_only,
	promotion_first_order_only: m.promotion_reason_first_order_only,
	promotion_changed: m.error_cart_changed,
};

// Why a coupon does not apply; `minimum` is the formatted minimum subtotal when that is
// the reason.
export function promotionReasonMessage(reason: string, minimum: string | null) {
	if (reason === "min_subtotal_not_met" && minimum)
		return m.promotion_reason_min_subtotal_not_met({ amount: minimum });
	return Object.hasOwn(PROMOTION_REASONS, reason)
		? PROMOTION_REASONS[reason]()
		: m.promotion_reason_not_found();
}

export function errorMessage(error: unknown): string {
	const e = apiErrorOf(error);
	if (!e) {
		console.error(error);
		return m.error_generic();
	}
	switch (e.code) {
		case "quantity_exceeds_limit":
			return typeof e.body.max === "number"
				? m.error_quantity_exceeds_limit({ max: String(e.body.max) })
				: m.error_generic();
		case "insufficient_stock": {
			// `lines`: an order's (back office); `items`: a cart's (storefront).
			if (Array.isArray(e.body.lines))
				return m.error_insufficient_stock_lines({
					lines: (
						e.body.lines as {
							sku: string;
							requested: number;
							available: number;
						}[]
					)
						.map((l) => `${l.sku} (${l.available} / ${l.requested})`)
						.join(", "),
				});
			if (Array.isArray(e.body.items)) return m.error_insufficient_stock_cart();
			const available = String(e.body.available);
			// Stock adjustments report only what is left; order fulfilment also reports the request.
			return e.body.requested === undefined
				? m.error_insufficient_stock_available({ available })
				: m.error_insufficient_stock({
						available,
						requested: String(e.body.requested),
					});
		}
		case "promotion_invalid":
			return promotionReasonMessage(String(e.body.reason), null);
		case "variant_has_stock":
			return m.error_variant_has_stock({ onHand: String(e.body.onHand) });
	}
	return Object.hasOwn(MESSAGES, e.code)
		? MESSAGES[e.code]()
		: m.error_generic();
}
