import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { accessTo, type StaffArea } from "#/lib/roles";

let session: { user: { id: string; role?: string; banned?: boolean } } | null =
	null;
const env = {};
mock.module("cloudflare:workers", () => ({ env }));
mock.module("#/lib/auth", () => ({
	auth: { api: { getSession: async () => session } },
	authMethods: { google: false, password: true },
}));
const { requireStaff } = await import("./auth");
const { admin } = await import("./routes/admin");
const { ADMIN_AREAS } = await import("./routes/admin/areas");

const body = (res: Response): Promise<unknown> => res.json();

const guarded = new Hono().use("*", requireStaff).get("/", (c) =>
	c.json({
		id: c.get("adminUserId" as never),
		role: c.get("staffRole" as never),
	}),
);

const routes = admin.routes.filter((r) => r.method !== "ALL");
const prefixOf = (path: string) => `/${path.split("/")[1]}`;
const request = (method: string, path: string) =>
	admin.request(path.replace(/:[A-Za-z]+(\{[^}]*\})?/g, "1"), {
		method,
		headers: { "content-type": "application/json" },
		body: method === "GET" || method === "HEAD" ? undefined : "{}",
	});

describe("requireStaff", () => {
	test("answers 401 without a session", async () => {
		session = null;
		const res = await guarded.request("/");
		expect(res.status).toBe(401);
		expect(await body(res)).toEqual({ error: "unauthorized" });
	});

	test("answers 403 to a customer, an unknown role or a banned admin", async () => {
		for (const user of [
			{ id: "u", role: "customer" },
			{ id: "u", role: "user" },
			{ id: "u" },
			{ id: "u", role: "admin", banned: true },
			{ id: "u", role: "support", banned: true },
		]) {
			session = { user };
			const res = await guarded.request("/");
			expect(res.status).toBe(403);
			expect(await body(res)).toEqual({ error: "forbidden" });
		}
	});

	test("lets support and admins through and says who they are", async () => {
		for (const role of ["admin", "support"]) {
			session = { user: { id: `${role}-1`, role } };
			const res = await guarded.request("/");
			expect(res.status).toBe(200);
			expect(await body(res)).toEqual({ id: `${role}-1`, role });
		}
	});
});

describe("the admin API", () => {
	test("answers 401 on every route when there is no session", async () => {
		session = null;
		expect(routes.length).toBeGreaterThan(40);
		const open: string[] = [];
		for (const route of routes) {
			const res = await request(route.method, route.path);
			if (res.status !== 401) open.push(`${route.method} ${route.path}`);
		}
		expect(open).toEqual([]);
	});

	test("every mounted route belongs to an area", () => {
		const unmapped = routes
			.map((r) => prefixOf(r.path))
			.filter((p) => !(p in ADMIN_AREAS));
		expect([...new Set(unmapped)]).toEqual([]);
	});

	test("answers 403 to a customer on every route", async () => {
		session = { user: { id: "c", role: "customer" } };
		const open: string[] = [];
		for (const route of routes) {
			const res = await request(route.method, route.path);
			if (res.status !== 403) open.push(`${route.method} ${route.path}`);
		}
		expect(open).toEqual([]);
	});

	test("support reaches exactly what its access allows, on every route", async () => {
		session = { user: { id: "s", role: "support" } };
		const wrong: string[] = [];
		for (const route of routes) {
			const area = ADMIN_AREAS[
				prefixOf(route.path) as keyof typeof ADMIN_AREAS
			] as StaffArea;
			const access = accessTo({ role: "support" }, area);
			const allowed =
				access === "write" ||
				(access === "read" && ["GET", "HEAD"].includes(route.method));
			const res = await request(route.method, route.path);
			if (allowed === (res.status === 403))
				wrong.push(`${route.method} ${route.path} ${res.status}`);
		}
		expect(wrong).toEqual([]);
	});

	test("support is refused reports, exports, purchasing, settings, inventory, audit and catalogue changes", async () => {
		session = { user: { id: "s", role: "support" } };
		for (const [method, path] of [
			["GET", "/reports/sales"],
			["GET", "/exports/orders.csv"],
			["GET", "/purchase-orders"],
			["GET", "/suppliers"],
			["GET", "/settings"],
			["PATCH", "/settings"],
			["GET", "/inventory"],
			["GET", "/audit-events"],
			["GET", "/dashboard"],
			["POST", "/products"],
			["PATCH", "/products/1"],
			["POST", "/brands"],
			["PATCH", "/shipping-zones/1"],
		] as const) {
			const res = await request(method, path);
			expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 403`);
		}
	});

	test("support may read the catalogue and shipping zones and work on orders and customers", async () => {
		session = { user: { id: "s", role: "support" } };
		for (const [method, path] of [
			["GET", "/products/list"],
			["GET", "/brands/options"],
			["GET", "/shipping-zones/options"],
			["GET", "/orders"],
			["PATCH", "/orders/1"],
			["POST", "/orders/1/cancel"],
			["GET", "/customers"],
			["PATCH", "/customers/1"],
			["GET", "/followups"],
		] as const) {
			const res = await request(method, path);
			expect(`${method} ${path} ${res.status === 403}`).toBe(
				`${method} ${path} false`,
			);
		}
	});
});
