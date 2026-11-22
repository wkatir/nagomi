import { expect, test } from "bun:test";
import { withSecurityHeaders } from "./security";

test("every response gets the security headers", () => {
	const res = withSecurityHeaders(
		new Request("https://nagomi.example/"),
		new Response("<html></html>", { headers: { "content-type": "text/html" } }),
	);
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	expect(res.headers.get("x-frame-options")).toBe("DENY");
	expect(res.headers.get("referrer-policy")).toBe(
		"strict-origin-when-cross-origin",
	);
	expect(res.headers.get("strict-transport-security")).toContain("max-age=");
	expect(res.headers.get("content-security-policy-report-only")).toContain(
		"frame-ancestors 'none'",
	);
	expect(res.headers.get("content-type")).toBe("text/html");
	expect(res.headers.get("cache-control")).toBeNull();
});

test("admin and auth API responses are not cached", () => {
	for (const path of ["/api/admin/orders", "/api/auth/get-session"])
		expect(
			withSecurityHeaders(
				new Request(`https://nagomi.example${path}`),
				Response.json({}),
			).headers.get("cache-control"),
		).toBe("no-store");
});

test("redirects keep their status and location", () => {
	const res = withSecurityHeaders(
		new Request("https://nagomi.example/en"),
		new Response(null, { status: 307, headers: { location: "/en/" } }),
	);
	expect(res.status).toBe(307);
	expect(res.headers.get("location")).toBe("/en/");
});
