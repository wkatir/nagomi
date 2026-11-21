import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { DTE_TYPES, TAX_DOCUMENT_STATUSES } from "#/lib/enums";
import { actor, createdAt, id, isDate, oneOf, updatedAt } from "./_helpers";
import { orders } from "./orders";

// Written in the batch of the payment or delivery that makes the sale taxable; Hacienda's
// identifiers arrive with the provider's answer (src/server/invoicing.ts).
export const taxDocuments = sqliteTable(
	"tax_documents",
	{
		id: id(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id),
		dteType: text("dte_type", { enum: DTE_TYPES }).notNull(),
		status: text("status", { enum: TAX_DOCUMENT_STATUSES })
			.notNull()
			.default("queued"),
		// Sent as Idempotency-Key: a resend of the same body returns the same document.
		idempotencyKey: text("idempotency_key").notNull().unique(),
		// The body exactly as it is sent, so every resend is identical.
		request: text("request").notNull(),
		// What the order charges, in minor units; the provider's total must match it.
		expectedTotal: integer("expected_total").notNull(),
		providerId: text("provider_id").unique(),
		controlNumber: text("control_number"),
		generationCode: text("generation_code").unique(),
		seal: text("seal"),
		issuedOn: text("issued_on"),
		// From the provider's answer, in minor units. A Factura's taxed amount includes IVA.
		taxed: integer("taxed"),
		iva: integer("iva"),
		total: integer("total"),
		// Hacienda's reasons (motivoRechazo, JSON) when rejected.
		rejection: text("rejection"),
		// The last problem a person has to look at: the provider's refusal, a credential or
		// network failure while queued, or a total that differs from the order's.
		error: text("error"),
		// R2 keys (DOCUMENTS bucket) of the signed JSON and the PDF, kept 10 years.
		jsonKey: text("json_key"),
		pdfKey: text("pdf_key"),
		// The customer's link to the documents (/f/<token>).
		publicToken: text("public_token").notNull().unique(),
		voidReason: text("void_reason"),
		voidResponsible: text("void_responsible"),
		voidedAt: text("voided_at"),
		voidedBy: actor("voided_by"),
		createdAt: createdAt(),
		createdBy: actor("created_by").notNull(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("tax_documents_dte_type", t.dteType, DTE_TYPES),
		oneOf("tax_documents_status", t.status, TAX_DOCUMENT_STATUSES),
		check("tax_documents_expected_total", sql`${t.expectedTotal} > 0`),
		check(
			"tax_documents_issued_on",
			sql`${t.issuedOn} is null or ${isDate(t.issuedOn)}`,
		),
		check(
			"tax_documents_emitted",
			sql`${t.status} in ('queued', 'failed') or (${t.providerId} is not null and ${t.controlNumber} is not null and ${t.generationCode} is not null and ${t.issuedOn} is not null and ${t.total} is not null)`,
		),
		check(
			"tax_documents_sealed",
			sql`${t.status} not in ('sealed', 'voided') or ${t.seal} is not null`,
		),
		check(
			"tax_documents_voided",
			sql`${t.status} <> 'voided' or (${t.voidedAt} is not null and ${t.voidReason} is not null and ${t.voidResponsible} is not null)`,
		),
		uniqueIndex("tax_documents_live_invoice")
			.on(t.orderId)
			.where(
				sql`dte_type = '01' and status not in ('rejected', 'failed', 'voided')`,
			),
		index("tax_documents_order_idx").on(t.orderId),
		index("tax_documents_status_idx").on(t.status),
		index("tax_documents_issued_idx").on(t.issuedOn),
	],
);
