import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { requireClientIp } from "./client-ip";

const app = new Hono()
	.use("*", requireClientIp)
	.post("/", (c) => c.json({ ok: true }));

describe("requireClientIp", () => {
	test("refuses a request without cf-connecting-ip with a 400", async () => {
		const res = await app.request("/", { method: "POST" });
		expect(res.status).toBe(400);
		expect(await res.text()).toBe(
			JSON.stringify({ error: "client_ip_missing" }),
		);
	});

	test("lets a request through Cloudflare pass", async () => {
		const res = await app.request("/", {
			method: "POST",
			headers: { "cf-connecting-ip": "203.0.113.9" },
		});
		expect(res.status).toBe(200);
	});
});
