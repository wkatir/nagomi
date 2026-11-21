import type { Context } from "hono";

// The runtime rejects a broken multipart body with a TypeError: the client's error, a 400.
export async function multipartForm(c: Context): Promise<FormData | Response> {
	const type = c.req.header("content-type")?.toLowerCase() ?? "";
	if (!type.startsWith("multipart/form-data"))
		return c.json({ error: "invalid_form" as const }, 400);
	try {
		return await c.req.formData();
	} catch (e) {
		if (e instanceof TypeError)
			return c.json({ error: "invalid_form" as const }, 400);
		throw e;
	}
}
