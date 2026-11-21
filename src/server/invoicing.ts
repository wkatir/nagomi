// The Factura is due when the buyer pays or receives the goods, whichever comes first
// (Ley IVA Art. 8, CT Art. 107), so the routes that record either add a queued row to their
// own batch: a sale is never left without its document. The cron resends with the same
// body and key, and files the signed JSON and PDF, which the issuer must keep 10 years.
import { env } from "cloudflare:workers";
import {
	and,
	asc,
	count,
	eq,
	exists,
	inArray,
	isNull,
	notExists,
	notInArray,
	type SQLWrapper,
} from "drizzle-orm";
import { type Db, schema } from "#/db";
import { now, type PaymentMethod } from "#/db/schema";
import { storeToday } from "#/lib/dates";
import { insertIfExists } from "./domain/d1";
import {
	invoiceKey,
	invoiceRequest,
	minorUnits,
	type Receptor,
	statusFromProvider,
	voidDeadline,
} from "./domain/invoicing";
import { returnedOfLine } from "./domain/order-sql";
import { amountOwed } from "./domain/payments";
import { getSettings } from "./domain/settings";
import {
	greenersys,
	invoicingConfigured,
	type ProviderDocument,
	ProviderRefused,
	ProviderUnavailable,
	type VoidRequest,
} from "./integrations/greenersys";

const { orderItems, orders, taxDocuments } = schema;

export type TaxDocument = typeof taxDocuments.$inferSelect;

const liveInvoiceOf = (orderId: number) =>
	and(
		eq(taxDocuments.orderId, orderId),
		eq(taxDocuments.dteType, "01"),
		notInArray(taxDocuments.status, ["rejected", "failed", "voided"]),
	);

// The order as it will stand once the batch that invoices it is written.
export type InvoicedOrder = {
	id: number;
	code: string;
	status: "confirmed" | "fulfilled" | "delivered";
	subtotal: number;
	discount: number;
	shipping: number;
	paymentMethod: PaymentMethod;
};

// `guard` is the caller's batch guard: place the insert before the writes that change
// what it checks.
export async function queueInvoice(
	db: Db,
	order: InvoicedOrder,
	options: {
		actor: string;
		guard: SQLWrapper;
		receptor?: Receptor;
		waitForSeal?: number;
	},
) {
	if (!invoicingConfigured()) return null;
	const [lines, [previous], live, settings] = await Promise.all([
		db
			.select({
				sku: orderItems.sku,
				brandName: orderItems.brandName,
				productName: orderItems.productName,
				sizeValue: orderItems.sizeValue,
				sizeUnit: orderItems.sizeUnit,
				quantity: orderItems.quantity,
				unitPrice: orderItems.unitPrice,
				returned: returnedOfLine,
			})
			.from(orderItems)
			.where(eq(orderItems.orderId, order.id)),
		db
			.select({ n: count() })
			.from(taxDocuments)
			.where(eq(taxDocuments.orderId, order.id)),
		db.query.taxDocuments.findFirst({ where: liveInvoiceOf(order.id) }),
		getSettings(db),
	]);
	if (live) return null;
	const invoice = { ...order, lines };
	if (amountOwed(invoice) <= 0) return null;
	const { body, expectedTotal } = invoiceRequest(invoice, {
		locale: settings.defaultLocale,
		receptor: options.receptor,
		waitForSeal: options.waitForSeal,
	});
	// Wrapped: returned bare from this async function, the query (a thenable) would run
	// here instead of in the caller's batch.
	return {
		insert: insertIfExists(
			db,
			taxDocuments,
			{
				orderId: order.id,
				dteType: "01",
				idempotencyKey: invoiceKey(order.code, previous.n + 1),
				request: JSON.stringify(body),
				expectedTotal,
				publicToken: crypto.randomUUID(),
				createdBy: options.actor,
			},
			db
				.select({ id: orders.id })
				.from(orders)
				.where(
					and(
						eq(orders.id, order.id),
						exists(options.guard),
						notExists(
							db
								.select({ id: taxDocuments.id })
								.from(taxDocuments)
								.where(liveInvoiceOf(order.id)),
						),
					),
				),
		),
	};
}

// Guarded by the status the row had when read, so two concurrent updates cannot move it
// backwards.
async function applyAnswer(db: Db, doc: TaxDocument, answer: ProviderDocument) {
	const status = statusFromProvider(answer.estado);
	const total = minorUnits(answer.totalPagar);
	const externalVoid = status === "voided" && doc.voidReason === null;
	await db
		.update(taxDocuments)
		.set({
			status,
			providerId: answer.id,
			controlNumber: answer.numeroControl,
			generationCode: answer.codigoGeneracion,
			seal: answer.sello,
			issuedOn: answer.fechaEmision,
			taxed: minorUnits(answer.totales.gravada),
			iva: minorUnits(answer.totales.iva),
			total,
			rejection: answer.motivoRechazo
				? JSON.stringify(answer.motivoRechazo)
				: null,
			error:
				total === doc.expectedTotal
					? null
					: `total_mismatch: expected ${doc.expectedTotal}, provider ${total}`,
			...(status === "voided"
				? {
						voidedAt: now,
						...(externalVoid
							? {
									voidReason: "Anulado desde GreenerSys",
									voidResponsible: "GreenerSys",
								}
							: {}),
					}
				: {}),
			updatedAt: now,
		})
		.where(
			and(eq(taxDocuments.id, doc.id), eq(taxDocuments.status, doc.status)),
		);
}

async function noteProblem(db: Db, doc: TaxDocument, error: string) {
	await db
		.update(taxDocuments)
		.set({ error, updatedAt: now })
		.where(
			and(eq(taxDocuments.id, doc.id), eq(taxDocuments.status, doc.status)),
		);
}

// A refused body fails the document (a person fixes the data and issues a new one);
// anything else leaves it queued for the cron.
export async function sendInvoice(db: Db, doc: TaxDocument) {
	if (doc.status !== "queued")
		throw new Error(`Tax document ${doc.id} is ${doc.status}, not queued`);
	try {
		await applyAnswer(
			db,
			doc,
			await greenersys.emit(JSON.parse(doc.request), doc.idempotencyKey),
		);
	} catch (e) {
		if (e instanceof ProviderRefused) {
			await db
				.update(taxDocuments)
				.set({ status: "failed", error: e.providerMessage, updatedAt: now })
				.where(
					and(eq(taxDocuments.id, doc.id), eq(taxDocuments.status, "queued")),
				);
			return;
		}
		if (e instanceof ProviderUnavailable)
			return noteProblem(db, doc, e.message);
		throw e;
	}
}

export async function sendQueuedInvoice(db: Db, orderId: number) {
	const doc = await db.query.taxDocuments.findFirst({
		where: and(
			eq(taxDocuments.orderId, orderId),
			eq(taxDocuments.status, "queued"),
		),
	});
	if (doc) await sendInvoice(db, doc);
}

export async function refreshInvoice(db: Db, doc: TaxDocument) {
	if (doc.providerId === null)
		throw new Error(`Tax document ${doc.id} was never emitted`);
	try {
		await applyAnswer(db, doc, await greenersys.get(doc.providerId));
	} catch (e) {
		if (e instanceof ProviderRefused || e instanceof ProviderUnavailable)
			return noteProblem(db, doc, e.message);
		throw e;
	}
}

// Hacienda does not keep the issuer's copy.
export async function storeInvoiceFiles(db: Db, doc: TaxDocument) {
	if (doc.status !== "sealed" || !doc.providerId || !doc.issuedOn)
		throw new Error(`Tax document ${doc.id} is not sealed`);
	const base = `dte/${doc.issuedOn.slice(0, 7)}/${doc.generationCode}`;
	let json: ArrayBuffer;
	let pdf: ArrayBuffer;
	try {
		[json, pdf] = await Promise.all([
			greenersys.file(doc.providerId, "json"),
			greenersys.file(doc.providerId, "pdf"),
		]);
	} catch (e) {
		if (e instanceof ProviderRefused || e instanceof ProviderUnavailable)
			return noteProblem(db, doc, e.message);
		throw e;
	}
	await Promise.all([
		env.DOCUMENTS.put(`${base}.json`, json, {
			httpMetadata: { contentType: "application/json" },
		}),
		env.DOCUMENTS.put(`${base}.pdf`, pdf, {
			httpMetadata: { contentType: "application/pdf" },
		}),
	]);
	await db
		.update(taxDocuments)
		.set({ jsonKey: `${base}.json`, pdfKey: `${base}.pdf`, updatedAt: now })
		.where(and(eq(taxDocuments.id, doc.id), isNull(taxDocuments.jsonKey)));
}

export class VoidNotAllowed extends Error {
	constructor(readonly reason: "not_sealed" | "deadline_passed") {
		super(`Void not allowed: ${reason}`);
	}
}

// The provider may answer while the event is still on its way to Hacienda: the reason is
// kept now and the status turns voided when a later answer says ANULADO.
export async function voidInvoice(
	db: Db,
	doc: TaxDocument,
	request: VoidRequest,
	actor: string,
) {
	if (doc.status !== "sealed" || !doc.providerId || !doc.issuedOn)
		throw new VoidNotAllowed("not_sealed");
	const { timeZone } = await getSettings(db);
	if (storeToday(timeZone) > voidDeadline(doc.issuedOn))
		throw new VoidNotAllowed("deadline_passed");
	const answer = await greenersys.void(doc.providerId, request);
	await db
		.update(taxDocuments)
		.set({
			voidReason: request.motivo,
			voidResponsible: request.responsable.nombre,
			voidedBy: actor,
			updatedAt: now,
		})
		.where(and(eq(taxDocuments.id, doc.id), eq(taxDocuments.status, "sealed")));
	const fresh = await db.query.taxDocuments.findFirst({
		where: eq(taxDocuments.id, doc.id),
	});
	if (!fresh) throw new Error(`Tax document ${doc.id} vanished`);
	await applyAnswer(db, fresh, answer);
}

// Small batches keep a run under the Workers Free limit of 50 subrequests.
export async function runInvoicing(db: Db) {
	if (!invoicingConfigured()) return;
	const [queued, pending, unfiled] = await Promise.all([
		db.query.taxDocuments.findMany({
			where: eq(taxDocuments.status, "queued"),
			orderBy: asc(taxDocuments.updatedAt),
			limit: 5,
		}),
		db.query.taxDocuments.findMany({
			where: inArray(taxDocuments.status, ["processing", "contingency"]),
			orderBy: asc(taxDocuments.updatedAt),
			limit: 10,
		}),
		db.query.taxDocuments.findMany({
			where: and(
				eq(taxDocuments.status, "sealed"),
				isNull(taxDocuments.jsonKey),
			),
			orderBy: asc(taxDocuments.updatedAt),
			limit: 5,
		}),
	]);
	for (const doc of queued) await sendInvoice(db, doc);
	for (const doc of pending) await refreshInvoice(db, doc);
	for (const doc of unfiled) await storeInvoiceFiles(db, doc);
}
