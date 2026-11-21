import { createMiddleware } from "hono/factory";

// Cloudflare sets cf-connecting-ip on every request it serves (the local runtime does
// too), so a request without it did not come through Cloudflare: refused with a 400,
// never counted under a shared key or answered with a 500.
export const requireClientIp = createMiddleware(async (c, next) => {
	if (!c.req.header("cf-connecting-ip"))
		return c.json({ error: "client_ip_missing" }, 400);
	return next();
});
