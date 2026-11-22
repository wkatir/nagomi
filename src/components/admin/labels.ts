import { m } from "#/paraglide/messages";

export const languageName = {
	es: m.language_name_es,
	en: m.language_name_en,
} as const;

export const orderStatusLabel = {
	pending: m.admin_status_pending,
	paid: m.admin_status_paid,
	shipped: m.admin_status_shipped,
	delivered: m.admin_status_delivered,
	cancelled: m.admin_status_cancelled,
} as const;
export const channelLabel = {
	web: m.admin_channel_web,
	whatsapp: m.admin_channel_whatsapp,
	instagram: m.admin_channel_instagram,
	in_person: m.admin_channel_in_person,
} as const;
export const purchaseStatusLabel = {
	draft: m.admin_po_status_draft,
	ordered: m.admin_po_status_ordered,
	partially_received: m.admin_po_status_partially_received,
	received: m.admin_po_status_received,
	cancelled: m.admin_po_status_cancelled,
} as const;
export const productStatusLabel = {
	draft: m.admin_product_status_draft,
	published: m.admin_product_status_published,
	archived: m.admin_product_status_archived,
} as const;
export const imageKindLabel = {
	packshot: m.admin_product_kind_packshot,
	lifestyle: m.admin_product_kind_lifestyle,
	detail: m.admin_product_kind_detail,
} as const;
export const shippingMethodLabel = {
	pickup: m.shipping_method_pickup,
	own_delivery: m.shipping_method_own_delivery,
	courier: m.shipping_method_courier,
} as const;
export const promotionStatusLabel = {
	active: m.admin_promotion_status_active,
	inactive: m.admin_promotion_status_inactive,
	archived: m.admin_promotion_status_archived,
} as const;
export const promotionTypeLabel = {
	percentage: m.admin_promotion_type_percentage,
	fixed: m.admin_promotion_type_fixed,
} as const;
export const zoneStatusLabel = {
	active: m.admin_zone_status_active,
	archived: m.admin_zone_status_archived,
} as const;
export const consentChannelLabel = channelLabel;
export const customerSegmentLabel = {
	new: m.admin_segment_new,
	occasional: m.admin_segment_occasional,
	frequent: m.admin_segment_frequent,
	inactive: m.admin_segment_inactive,
} as const;
export const paymentStatusLabel = {
	unpaid: m.admin_unpaid,
	partially_paid: m.admin_order_partially_paid,
	paid: m.admin_paid,
	refund_due: m.admin_order_refund_due,
	refunded: m.admin_order_refunded,
	nothing_due: m.admin_order_nothing_due,
} as const;
export const movementReasonLabel = {
	damaged: m.movement_reason_damaged,
	demo_unit: m.movement_reason_demo_unit,
	own_use: m.movement_reason_own_use,
	lost_theft: m.movement_reason_lost_theft,
	count_difference: m.movement_reason_count_difference,
	customer_return: m.movement_reason_customer_return,
	other: m.movement_reason_other,
} as const;
export const returnReasonLabel = {
	withdrawal: m.admin_return_reason_withdrawal,
	defective: m.admin_return_reason_defective,
	wrong_item: m.admin_return_reason_wrong_item,
	other: m.admin_return_reason_other,
} as const;
export const dispositionLabel = {
	restock: m.admin_disposition_restock,
	write_off: m.admin_disposition_write_off,
} as const;
export const consentPurposeLabel = {
	privacy_notice: m.admin_consent_privacy_notice,
	terms: m.admin_consent_terms,
	marketing_email: m.admin_consent_marketing_email,
	marketing_whatsapp: m.admin_consent_marketing_whatsapp,
} as const;
export const supplierStatusLabel = {
	active: m.admin_supplier_status_active,
	archived: m.admin_supplier_status_archived,
} as const;
export const movementKindLabel = {
	receive: m.admin_movement_kind_receive,
	sale: m.admin_movement_kind_sale,
	cancellation: m.admin_movement_kind_cancellation,
	return: m.admin_movement_kind_return,
	adjustment: m.admin_movement_kind_adjustment,
	waste: m.admin_movement_kind_waste,
} as const;
export const stockViewLabel = {
	low: m.admin_inventory_view_low,
	out: m.admin_inventory_view_out,
} as const;
export const reviewStatusLabel = {
	pending: m.admin_review_status_pending,
	approved: m.admin_review_status_approved,
	rejected: m.admin_review_status_rejected,
} as const;
export const followupActionLabel = {
	collect_payment: m.admin_followup_action_collect_payment,
	ship: m.admin_followup_action_ship,
	confirm_delivery: m.admin_followup_action_confirm_delivery,
} as const;
