import { describe, expect, test } from "bun:test";
import { serveMedia } from "./media";

const key = `${"a".repeat(64)}.webp`;
const body = new Uint8Array([1, 2, 3]);
const bucket = {
	head: async (k: string) => (k === key ? { size: body.length } : null),
	get: async (k: string) =>
		k === key ? { size: body.length, body: new Blob([body]).stream() } : null,
} as unknown as R2Bucket;
const get = (path: string, headers: Record<string, string> = {}) =>
	serveMedia(new Request(`http://x${path}`, { headers }), bucket);

describe("serveMedia", () => {
	test("serves a stored key with its type and immutable caching", async () => {
		const res = await get(`/media/${key}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/webp");
		expect(res.headers.get("cache-control")).toBe(
			"public, max-age=31536000, immutable",
		);
		expect(res.headers.get("etag")).toBe(`"${"a".repeat(64)}"`);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
	});

	test("If-None-Match: strong, weak, in a list, and *", async () => {
		const tag = `"${"a".repeat(64)}"`;
		for (const value of [tag, `W/${tag}`, `"x", W/${tag}`, "*"])
			expect(
				(await get(`/media/${key}`, { "If-None-Match": value })).status,
			).toBe(304);
		expect(
			(await get(`/media/${key}`, { "If-None-Match": '"x"' })).status,
		).toBe(200);
		const missing = `${"b".repeat(64)}.webp`;
		expect(
			(await get(`/media/${missing}`, { "If-None-Match": "*" })).status,
		).toBe(404);
	});

	test("anything else is a 404 or 405", async () => {
		expect((await get(`/media/${"b".repeat(64)}.webp`)).status).toBe(404);
		expect((await get("/media/../wrangler.jsonc")).status).toBe(404);
		const post = await serveMedia(
			new Request(`http://x/media/${key}`, { method: "POST" }),
			bucket,
		);
		expect(post.status).toBe(405);
	});
});
