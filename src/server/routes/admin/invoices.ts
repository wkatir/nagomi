import { env } from "cloudflare:workers";
import { and, count, eq, inArray, isNotNull, like, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import {
	invoiceListSearch,
	issueInvoiceInput,
	voidInvoiceInput,
} from "#/lib/schemas/invoices";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { voidDeadline } from "../../domain/invoicing";
import { pageWindow, sortBy, toPaged } from "../../domain/list-query";
import {
	greenersys,
	invoicingConfigured,
	ProviderRefused,
	ProviderUnavailable,
} from "../../integrations/greenersys";
import {
	queueInvoice,
	refreshInvoice,
	sendInvoice,
	storeInvoiceFiles,
	type TaxDocument,
	VoidNotAllowed,
	voidInvoice,
} from "../../invoicing";

const { orders, taxDocuments } = schema;

// The customer's link is absolute so it can be pasted into WhatsApp as is.
const view = (doc: TaxDocument, orderCode: string, origin: string) => {
	let deadline: string | null = null;
	if (doc.status === "sealed") {
		if (doc.issuedOn === null)
			throw new Error(`Tax document ${doc.id} is sealed without an issue date`);
		deadline = voidDeadline(doc.issuedOn);
	}
	return {
		id: doc.id,
		orderId: doc.orderId,
		orderCode,
		dteType: doc.dteType,
		status: doc.status,
		controlNumber: doc.controlNumber,
		generationCode: doc.generationCode,
		seal: doc.seal,
		issuedOn: doc.issuedOn,
		total: doc.total,
		expectedTotal: doc.expectedTotal,
		error: doc.error,
		rejection: doc.rejection
			? (JSON.parse(doc.rejection) as {
					problema: string;
					accion: string;
					donde: string;
				}[])
			: null,
		filed: doc.jsonKey !== null,
		customerLink:
			doc.status === "sealed" ? `${origin}/f/${doc.publicToken}` : null,
		voidDeadline: deadline,
		voidReason: doc.voidReason,
		voidResponsible: doc.voidResponsible,
		voidedAt: doc.voidedAt,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
};

const kindParam = z.object({
	id: z.coerce.number().int().positive(),
	kind: z.enum(["json", "pdf"]),
});

async function documentWithCode(id: number) {
	const [row] = await getDb()
		.select({ doc: taxDocuments, code: orders.code })
		.from(taxDocuments)
		.innerJoin(orders, eq(orders.id, taxDocuments.orderId))
		.where(eq(taxDocuments.id, id));
	return row ?? null;
}

const STUCK_MINUTES = 30;

export const invoicesRouter = new Hono<AdminEnv>()
	.get("/", validate("query", invoiceListSearch), async (c) => {
		const db = getDb();
		const query = c.req.valid("query");
		const where = and(
			query.status ? eq(taxDocuments.status, query.status) : undefined,
			query.orderId ? eq(taxDocuments.orderId, query.orderId) : undefined,
			query.q ? like(orders.code, `%${query.q.toUpperCase()}%`) : undefined,
		);
		const { limit, offset } = pageWindow(query);
		const [rows, [counted]] = await db.batch([
			db
				.select({ doc: taxDocuments, code: orders.code })
				.from(taxDocuments)
				.innerJoin(orders, eq(orders.id, taxDocuments.orderId))
				.where(where)
				.orderBy(
					...sortBy(
						{
							createdAt: taxDocuments.createdAt,
							issuedOn: taxDocuments.issuedOn,
							total: taxDocuments.expectedTotal,
							status: taxDocuments.status,
						},
						query.sort,
						query.dir,
						taxDocuments.id,
					),
				)
				.limit(limit)
				.offset(offset),
			db
				.select({ total: count() })
				.from(taxDocuments)
				.innerJoin(orders, eq(orders.id, taxDocuments.orderId))
				.where(where),
		]);
		const origin = new URL(c.req.url).origin;
		return c.json(
			toPaged(
				rows.map((r) => view(r.doc, r.code, origin)),
				counted.total,
				query,
			),
		);
	})
	.get("/attention", async (c) => {
		const db = getDb();
		const stuckBefore = sql`strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ${`-${STUCK_MINUTES} minutes`})`;
		const [[refused], [waiting], [stuck]] = await db.batch([
			db
				.select({ n: count() })
				.from(taxDocuments)
				.where(inArray(taxDocuments.status, ["failed", "rejected"])),
			db
				.select({ n: count() })
				.from(taxDocuments)
				.where(
					and(eq(taxDocuments.status, "queued"), isNotNull(taxDocuments.error)),
				),
			db
				.select({ n: count() })
				.from(taxDocuments)
				.where(
					and(
						inArray(taxDocuments.status, ["processing", "contingency"]),
						lt(taxDocuments.createdAt, stuckBefore),
					),
				),
		]);
		return c.json({
			configured: invoicingConfigured(),
			refused: refused.n,
			waiting: waiting.n,
			stuck: stuck.n,
		});
	})
	.get("/connection", async (c) => {
		if (!invoicingConfigured())
			return c.json({
				configured: false as const,
				host: null,
				types: [],
				error: null,
			});
		const host = new URL(env.GREENERSYS_API_URL).host;
		try {
			return c.json({
				configured: true as const,
				host,
				types: await greenersys.dteTypes(),
				error: null,
			});
		} catch (e) {
			if (e instanceof ProviderRefused || e instanceof ProviderUnavailable)
				return c.json({
					configured: true as const,
					host,
					types: [],
					error: e.message,
				});
			throw e;
		}
	})
	.post(
		"/orders/:id",
		validate("param", idParam),
		validate("json", issueInvoiceInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { receptor } = c.req.valid("json");
			if (!invoicingConfigured())
				return c.json({ error: "invoicing_not_configured" }, 503);
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			if (
				order.status !== "confirmed" &&
				order.status !== "fulfilled" &&
				order.status !== "delivered"
			)
				return c.json({ error: "invoice_not_allowed" }, 409);
			if (!order.paymentMethod)
				throw new Error(
					`Order ${id} is ${order.status} without a payment method`,
				);
			const asRead = db
				.select({ id: orders.id })
				.from(orders)
				.where(and(eq(orders.id, id), eq(orders.status, order.status)));
			const actor = c.var.adminUserId;
			const queued = await queueInvoice(
				db,
				{ ...order, status: order.status, paymentMethod: order.paymentMethod },
				{ actor, guard: asRead, receptor },
			);
			if (!queued) return c.json({ error: "invoice_exists" }, 409);
			const { meta } = await queued.insert;
			if (!meta.changes) return c.json({ error: "invoice_exists" }, 409);
			const doc = await db.query.taxDocuments.findFirst({
				where: and(
					eq(taxDocuments.orderId, id),
					eq(taxDocuments.status, "queued"),
				),
			});
			if (!doc) throw new Error(`Order ${id} lost the Factura just queued`);
			await audit(db, {
				actorUserId: actor,
				action: "tax_document.create",
				entityType: "tax_document",
				entityId: doc.id,
				data: { orderId: id, receptor: receptor !== undefined },
			});
			await sendInvoice(db, doc);
			return c.json({ ok: true }, 201);
		},
	)
	.post("/:id/refresh", validate("param", idParam), async (c) => {
		const db = getDb();
		const doc = await db.query.taxDocuments.findFirst({
			where: eq(taxDocuments.id, c.req.valid("param").id),
		});
		if (!doc) return c.json({ error: "not_found" }, 404);
		if (doc.status === "processing" || doc.status === "contingency")
			await refreshInvoice(db, doc);
		return c.json({ ok: true });
	})
	.post(
		"/:id/void",
		validate("param", idParam),
		validate("json", voidInvoiceInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const doc = await db.query.taxDocuments.findFirst({
				where: eq(taxDocuments.id, id),
			});
			if (!doc) return c.json({ error: "not_found" }, 404);
			try {
				await voidInvoice(
					db,
					doc,
					{
						tipoAnulacion: 2,
						motivo: input.reason,
						responsable: {
							nombre: input.responsible.name,
							tipoDocumento: input.responsible.documentType,
							numeroDocumento: input.responsible.documentNumber,
						},
					},
					c.var.adminUserId,
				);
			} catch (e) {
				if (e instanceof VoidNotAllowed)
					return e.reason === "not_sealed"
						? c.json({ error: "invoice_not_sealed" }, 409)
						: c.json({ error: "invoice_deadline_passed" }, 409);
				if (e instanceof ProviderRefused)
					return c.json(
						{ error: "invoice_refused", message: e.providerMessage },
						409,
					);
				if (e instanceof ProviderUnavailable)
					return c.json({ error: "invoicing_unavailable" }, 503);
				throw e;
			}
			await audit(db, {
				actorUserId: c.var.adminUserId,
				action: "tax_document.status",
				entityType: "tax_document",
				entityId: id,
				data: { orderId: doc.orderId, to: "voided", reason: input.reason },
			});
			return c.json({ ok: true });
		},
	)
	.get("/:id/:kind", validate("param", kindParam), async (c) => {
		const db = getDb();
		const { id, kind } = c.req.valid("param");
		const found = await documentWithCode(id);
		if (!found) return c.json({ error: "not_found" }, 404);
		let doc = found.doc;
		if (doc.jsonKey === null && doc.status === "sealed") {
			await storeInvoiceFiles(db, doc);
			const fresh = await db.query.taxDocuments.findFirst({
				where: eq(taxDocuments.id, id),
			});
			if (!fresh) throw new Error(`Tax document ${id} vanished`);
			doc = fresh;
		}
		const key = kind === "json" ? doc.jsonKey : doc.pdfKey;
		if (key === null) return c.json({ error: "invoice_not_filed" }, 409);
		const object = await env.DOCUMENTS.get(key);
		if (!object)
			throw new Error(`Tax document file ${key} is missing from the bucket`);
		return new Response(object.body, {
			headers: {
				"content-type":
					kind === "json" ? "application/json" : "application/pdf",
				"content-disposition": `attachment; filename="${found.code}-${doc.generationCode}.${kind}"`,
			},
		});
	});
