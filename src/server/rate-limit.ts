import { env } from "cloudflare:workers";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AdminEnv } from "./auth";

// CSV exports read whole tables.
export const exportLimit = createMiddleware<AdminEnv>(async (c, next) => {
	const { success } = await env.EXPORT_LIMITER.limit({
		key: c.var.adminUserId,
	});
	if (!success) return c.json({ error: "rate_limited" }, 429);
	return next();
});

// requireClientIp already refused requests without the client IP on these paths.
export async function withinLimit(c: Context, purpose: string) {
	const client = c.req.header("cf-connecting-ip");
	if (!client) throw new Error("cf-connecting-ip is missing");
	const { success } = await env.ORDER_LIMITER.limit({
		key: `${purpose}:${client}`,
	});
	return success;
}
