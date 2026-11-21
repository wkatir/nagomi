import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "#/db";
import { storeInvoiceFiles } from "./invoicing";

const { taxDocuments } = schema;

export const INVOICE_PREFIX = "/f/";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The buyer gets the signed JSON and its PDF through the agreed channel (Normativa de
// Cumplimiento DTE v2.0, rule 11): /f/<token> is the PDF, /f/<token>/json the JSON.
export async function invoiceFile(request: Request) {
	if (request.method !== "GET" && request.method !== "HEAD")
		return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
	const [token, kind = "pdf", ...rest] = new URL(request.url).pathname
		.slice(INVOICE_PREFIX.length)
		.split("/");
	if (!TOKEN.test(token) || (kind !== "pdf" && kind !== "json") || rest.length)
		return new Response("Not found", { status: 404 });
	const db = getDb();
	const sealed = and(
		eq(taxDocuments.publicToken, token),
		eq(taxDocuments.status, "sealed"),
	);
	let doc = await db.query.taxDocuments.findFirst({ where: sealed });
	if (!doc) return new Response("Not found", { status: 404 });
	if (doc.jsonKey === null) {
		await storeInvoiceFiles(db, doc);
		doc = await db.query.taxDocuments.findFirst({ where: sealed });
		if (!doc)
			throw new Error(`Sealed tax document with token ${token} vanished`);
		// The provider did not hand over the files; the problem is noted on the document.
		if (!doc.jsonKey) return new Response("Not ready", { status: 503 });
	}
	const key = kind === "pdf" ? doc.pdfKey : doc.jsonKey;
	if (!key) throw new Error(`Tax document ${doc.id} has its JSON but no PDF`);
	const object = await env.DOCUMENTS.get(key);
	if (!object)
		throw new Error(`Tax document file ${key} is missing from the bucket`);
	return new Response(request.method === "HEAD" ? null : object.body, {
		headers: {
			"Content-Type": kind === "pdf" ? "application/pdf" : "application/json",
			"Content-Disposition": `${kind === "pdf" ? "inline" : "attachment"}; filename="${doc.generationCode}.${kind}"`,
			"Cache-Control": "private, max-age=3600",
		},
	});
}
