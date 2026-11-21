import { createMiddleware } from "hono/factory";
import { auth } from "#/lib/auth";
import { isAdmin } from "#/lib/roles";

export type AdminEnv = {
	Variables: { adminUserId: string };
};

export const requireAdmin = createMiddleware<AdminEnv>(async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "unauthorized" }, 401);
	if (!isAdmin(session.user)) return c.json({ error: "forbidden" }, 403);
	c.set("adminUserId", session.user.id);
	return next();
});
