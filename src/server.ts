import { env } from "cloudflare:workers";
import handler from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";
import { MEDIA_PREFIX, serveMedia } from "./server/media";
import { withSecurityHeaders } from "./server/security";
import { SEO_FILES } from "./server/seo-files";
import { moved, movedTo } from "./server/url-rules";

export default {
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;
		if (pathname.startsWith(MEDIA_PREFIX))
			return withSecurityHeaders(req, await serveMedia(req, env.MEDIA));
		const seoFile = SEO_FILES.get(pathname);
		if (seoFile && (req.method === "GET" || req.method === "HEAD"))
			return withSecurityHeaders(req, await seoFile());
		const target = movedTo(url);
		if (target && (req.method === "GET" || req.method === "HEAD"))
			return withSecurityHeaders(req, moved(target, url.origin));
		const res = await paraglideMiddleware(req, () => handler.fetch(req));
		return withSecurityHeaders(req, res);
	},
};
