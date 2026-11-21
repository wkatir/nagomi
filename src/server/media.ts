import { mediaKeyType } from "./domain/images";

export const MEDIA_PREFIX = "/media/";

// The key is the hash of the content, so a URL always names the same bytes: cached for a
// year and revalidated with the ETag, answered without reading R2.
export async function serveMedia(request: Request, bucket: R2Bucket) {
	if (request.method !== "GET" && request.method !== "HEAD")
		return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
	const key = new URL(request.url).pathname.slice(MEDIA_PREFIX.length);
	const contentType = mediaKeyType(key);
	if (!contentType) return new Response("Not found", { status: 404 });
	const etag = `"${key.slice(0, 64)}"`;
	const headers = new Headers({
		"Content-Type": contentType,
		"Cache-Control": "public, max-age=31536000, immutable",
		ETag: etag,
	});
	// Weak comparison (RFC 9110): W/"x" matches "x"; "*" matches any stored object.
	const tags = (request.headers.get("If-None-Match") ?? "")
		.split(",")
		.map((tag) => tag.trim().replace(/^W\//, ""));
	if (tags.includes(etag)) return new Response(null, { status: 304, headers });
	if (tags.includes("*"))
		return (await bucket.head(key))
			? new Response(null, { status: 304, headers })
			: new Response("Not found", { status: 404 });
	if (request.method === "HEAD") {
		const object = await bucket.head(key);
		if (!object) return new Response("Not found", { status: 404 });
		headers.set("Content-Length", String(object.size));
		return new Response(null, { headers });
	}
	const object = await bucket.get(key);
	if (!object) return new Response("Not found", { status: 404 });
	headers.set("Content-Length", String(object.size));
	return new Response(object.body, { headers });
}
