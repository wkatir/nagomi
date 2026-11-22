import {
	AUDIT_ENTITY_TYPES,
	AUDIT_VERBS,
	type AuditEntityType,
	type AuditVerb,
} from "#/lib/schemas/audit";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const auditEntityLabel = {
	brand: m.admin_audit_entity_brand,
	bundle: m.admin_audit_entity_bundle,
	category: m.admin_audit_entity_category,
	collection: m.admin_audit_entity_collection,
	customer: m.admin_audit_entity_customer,
	home_slide: m.admin_audit_entity_home_slide,
	inventory_movement: m.admin_audit_entity_inventory_movement,
	media_file: m.admin_audit_entity_media_file,
	order: m.admin_audit_entity_order,
	page: m.admin_audit_entity_page,
	payment: m.admin_audit_entity_payment,
	product: m.admin_audit_entity_product,
	product_image: m.admin_audit_entity_product_image,
	promotion: m.admin_audit_entity_promotion,
	purchase_order: m.admin_audit_entity_purchase_order,
	purchase_receipt: m.admin_audit_entity_purchase_receipt,
	return: m.admin_audit_entity_return,
	shipping_zone: m.admin_audit_entity_shipping_zone,
	store_promise: m.admin_audit_entity_store_promise,
	store_settings: m.admin_audit_entity_store_settings,
	supplier: m.admin_audit_entity_supplier,
	supplier_item: m.admin_audit_entity_supplier_item,
	variant: m.admin_audit_entity_variant,
} as const satisfies Record<AuditEntityType, () => string>;

export const auditVerbLabel = {
	create: m.admin_audit_verb_create,
	update: m.admin_audit_verb_update,
	status: m.admin_audit_verb_status,
	archive: m.admin_audit_verb_archive,
} as const satisfies Record<AuditVerb, () => string>;

export const entityOptions = () =>
	AUDIT_ENTITY_TYPES.map((value) => ({
		value,
		label: auditEntityLabel[value](),
	})).sort((a, b) => a.label.localeCompare(b.label, getLocale()));

// A type or an action without a label is shown as stored, not hidden.
export function entityText(type: string): string {
	const known = AUDIT_ENTITY_TYPES.find((t) => t === type);
	return known ? auditEntityLabel[known]() : type;
}

export function verbText(action: string): string {
	const known = AUDIT_VERBS.find((verb) => action.endsWith(`.${verb}`));
	return known ? auditVerbLabel[known]() : action;
}
