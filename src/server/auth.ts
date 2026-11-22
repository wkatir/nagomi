import { createMiddleware } from "hono/factory";
import { auth } from "#/lib/auth";
import {
	ADMIN_ROLE,
	accessTo,
	isAdmin,
	isStaff,
	type StaffArea,
	type StaffRole,
	SUPPORT_ROLE,
} from "#/lib/roles";

export type AdminEnv = {
	Variables: { adminUserId: string; staffRole: StaffRole };
};

export const requireStaff = createMiddleware<AdminEnv>(async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "unauthorized" }, 401);
	if (!isStaff(session.user)) return c.json({ error: "forbidden" }, 403);
	c.set("adminUserId", session.user.id);
	c.set("staffRole", isAdmin(session.user) ? ADMIN_ROLE : SUPPORT_ROLE);
	return next();
});

const READ_METHODS = ["GET", "HEAD"];

export const requireArea = (area: StaffArea) =>
	createMiddleware<AdminEnv>(async (c, next) => {
		const access = accessTo({ role: c.var.staffRole }, area);
		if (
			access === "none" ||
			(access === "read" && !READ_METHODS.includes(c.req.method))
		)
			return c.json({ error: "forbidden" }, 403);
		return next();
	});

export const seesCosts = (c: { var: { staffRole?: StaffRole } }) =>
	c.var.staffRole === ADMIN_ROLE;
