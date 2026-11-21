import { z } from "zod";
import { TAX_DOCUMENT_STATUSES } from "#/lib/enums";
import { pagedSearch } from "#/lib/list";

export const INVOICE_SORTS = [
	"createdAt",
	"issuedOn",
	"total",
	"status",
] as const;

// `q` is part of the order code.
export const invoiceListSearch = pagedSearch(INVOICE_SORTS, {
	sort: "createdAt",
	dir: "desc",
}).extend({
	status: z.enum(TAX_DOCUMENT_STATUSES).optional(),
	orderId: z.coerce.number().int().positive().optional(),
});
export type InvoiceListSearch = z.infer<typeof invoiceListSearch>;

// CAT-022: "13" DUI, "36" NIT.
export const PERSON_DOCUMENT_TYPES = ["13", "36"] as const;

// Only when the customer asks for the invoice in their name (CT Art. 119-G).
export const invoiceReceptor = z
	.object({
		nombre: z.string().trim().min(1).max(250),
		tipoDocumento: z.enum(PERSON_DOCUMENT_TYPES).optional(),
		numeroDocumento: z.string().trim().min(1).max(25).optional(),
		correo: z.email().max(100).optional(),
	})
	.refine(
		(r) =>
			(r.tipoDocumento === undefined) === (r.numeroDocumento === undefined),
		{
			message: "Document type and number go together",
			path: ["numeroDocumento"],
		},
	);

export const issueInvoiceInput = z.object({
	receptor: invoiceReceptor.optional(),
});

// Hacienda requires the real person who invalidates a document.
export const voidInvoiceInput = z.object({
	reason: z.string().trim().min(5).max(200),
	responsible: z.object({
		name: z.string().trim().min(1).max(100),
		documentType: z.enum(PERSON_DOCUMENT_TYPES),
		documentNumber: z.string().trim().min(1).max(20),
	}),
});
