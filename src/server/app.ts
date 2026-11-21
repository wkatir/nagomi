import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { authMethods } from "#/lib/auth";
import { apiError } from "./api-error";
import { limitBody } from "./body-limit";
import { requireClientIp } from "./client-ip";
import { MAX_IMAGE_BYTES } from "./domain/images";
import { admin } from "./routes/admin";
import { IMAGE_UPLOAD_PATHS } from "./routes/admin/media";
import { storeCatalog } from "./routes/store-catalog";
import { storefront } from "./routes/storefront";

// Admin requests carry at most a legal page (20,000 characters).
const tooLarge = limitBody(128 * 1024);
// The file plus its form fields.
const imageUpload = bodyLimit({
	maxSize: MAX_IMAGE_BYTES + 64 * 1024,
	onError: (c) =>
		c.json({ error: "image_too_large", max: MAX_IMAGE_BYTES }, 413),
});

const publicBodyLimit = limitBody(16 * 1024);

export const api = new Hono()
	.basePath("/api")
	// Requests a cross-site form could send (form or plain-text bodies) must come from this
	// origin; JSON requests from another origin need a CORS preflight this API never grants.
	.use("*", csrf())
	.use("*", (c, next) =>
		c.req.method === "POST" && IMAGE_UPLOAD_PATHS.includes(c.req.path)
			? imageUpload(c, next)
			: tooLarge(c, next),
	)
	.use("/orders/*", publicBodyLimit)
	.use("/promotions/*", publicBodyLimit)
	// Their handlers rate limit by the client IP.
	.use("/orders/*", requireClientIp)
	.use("/promotions/*", requireClientIp)
	.route("/", storefront)
	.route("/", storeCatalog)
	.get("/sign-in-methods", (c) => c.json(authMethods))
	.route("/admin", admin)
	.onError(apiError);

export type Api = typeof api;
