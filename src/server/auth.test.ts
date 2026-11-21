import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

let session: { user: { id: string; role?: string; banned?: boolean } } | null =
	null;
const env = {};
mock.module("cloudflare:workers", () => ({ env }));
mock.module("#/lib/auth", () => ({
	auth: { api: { getSession: async () => session } },
	authMethods: { google: false, password: true },
}));
const { requireAdmin } = await import("./auth");
const { admin } = await import("./routes/admin");

// Hono types the body from the handlers, which is no use here.
const body = (res: Response): Promise<unknown> => res.json();

const guarded = new Hono()
	.use("*", requireAdmin)
	.get("/", (c) => c.json({ id: c.get("adminUserId" as never) }));

describe("requireAdmin", () => {
	test("answers 401 without a session", async () => {
		session = null;
		const res = await guarded.request("/");
		expect(res.status).toBe(401);
		expect(await body(res)).toEqual({ error: "unauthorized" });
	});

	test("answers 403 to a user who is not an admin, or is banned", async () => {
		for (const user of [
			{ id: "u", role: "user" },
			{ id: "u" },
			{ id: "u", role: "admin", banned: true },
		]) {
			session = { user };
			const res = await guarded.request("/");
			expect(res.status).toBe(403);
			expect(await body(res)).toEqual({ error: "forbidden" });
		}
	});

	test("lets an admin through and says who it is", async () => {
		session = { user: { id: "admin-1", role: "admin" } };
		const res = await guarded.request("/");
		expect(res.status).toBe(200);
		expect(await body(res)).toEqual({ id: "admin-1" });
	});
});

describe("the admin API", () => {
	// A route added to the admin router without the guard would answer something else.
	test("answers 401 on every route when there is no session", async () => {
		session = null;
		const routes = admin.routes.filter((r) => r.method !== "ALL");
		expect(routes.length).toBeGreaterThan(40);
		const open: string[] = [];
		for (const route of routes) {
			const path = route.path.replace(/:[A-Za-z]+(\{[^}]*\})?/g, "1");
			const res = await admin.request(path, { method: route.method });
			if (res.status !== 401) open.push(`${route.method} ${route.path}`);
		}
		expect(open).toEqual([]);
	});
});
