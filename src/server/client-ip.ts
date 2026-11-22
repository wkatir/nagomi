import { createMiddleware } from "hono/factory";

// Cloudflare (and the local runtime) always sets cf-connecting-ip; without it a request is
// refused rather than rate limited under a shared key.
export const requireClientIp = createMiddleware(async (c, next) => {
	if (!c.req.header("cf-connecting-ip"))
		return c.json({ error: "client_ip_missing" }, 400);
	return next();
});
