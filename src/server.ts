import { env } from "cloudflare:workers";
import handler from "@tanstack/react-start/server-entry";
import { getDb } from "./db";
import { paraglideMiddleware } from "./paraglide/server.js";
import { INVOICE_PREFIX, invoiceFile } from "./server/invoice-files";
import { runInvoicing } from "./server/invoicing";
import { MEDIA_PREFIX, serveMedia } from "./server/media";
import { withSecurityHeaders } from "./server/security";
import { SEO_FILES } from "./server/seo-files";
import { gone, isRetiredPath, moved, movedTo } from "./server/url-rules";

export default {
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;
		if (pathname.startsWith(MEDIA_PREFIX))
			return withSecurityHeaders(req, await serveMedia(req, env.MEDIA));
		if (pathname.startsWith(INVOICE_PREFIX))
			return withSecurityHeaders(req, await invoiceFile(req));
		const seoFile = SEO_FILES.get(pathname);
		if (seoFile && (req.method === "GET" || req.method === "HEAD"))
			return withSecurityHeaders(req, await seoFile());
		if (isRetiredPath(pathname)) return withSecurityHeaders(req, gone());
		const target = movedTo(url);
		if (target && (req.method === "GET" || req.method === "HEAD"))
			return withSecurityHeaders(req, moved(target, url.origin));
		const res = await paraglideMiddleware(req, () => handler.fetch(req));
		return withSecurityHeaders(req, res);
	},
	async scheduled(
		_controller: ScheduledController,
		_env: Env,
		ctx: ExecutionContext,
	) {
		ctx.waitUntil(runInvoicing(getDb()));
	},
};
