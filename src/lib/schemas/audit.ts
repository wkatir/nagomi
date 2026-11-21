import { z } from "zod";
import { dayRange, fromAfterTo, fromNotAfterTo } from "./dates";

// An action is `<entity>.<verb>`; audit.test.ts fails when the API writes an entity or a
// verb that is not listed.
export const AUDIT_ENTITY_TYPES = [
	"brand",
	"category",
	"collection",
	"concern",
	"customer",
	"home_slide",
	"inventory_movement",
	"media_file",
	"order",
	"page",
	"payment",
	"product",
	"product_image",
	"promotion",
	"purchase_order",
	"purchase_receipt",
	"return",
	"routine",
	"shipping_zone",
	"store_promise",
	"store_settings",
	"supplier",
	"supplier_item",
	"tax_document",
	"variant",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_VERBS = ["create", "update", "status", "archive"] as const;
export type AuditVerb = (typeof AUDIT_VERBS)[number];

export const auditFilterShape = {
	entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
	// Better Auth user id.
	actor: z.string().trim().min(1).max(64).optional(),
	verb: z.enum(AUDIT_VERBS).optional(),
	...dayRange,
};

export const auditListSearch = z
	.object(auditFilterShape)
	.refine(fromNotAfterTo, fromAfterTo);
export type AuditListSearch = z.infer<typeof auditListSearch>;
