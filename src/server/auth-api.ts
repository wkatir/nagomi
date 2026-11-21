import { Hono } from "hono";
import { auth } from "#/lib/auth";
import { limitBody } from "./body-limit";

// Better Auth only receives small JSON bodies (sign-in, sign-out) and OAuth redirects.
export const authApi = new Hono()
	.use("*", limitBody(16 * 1024))
	.all("*", (c) => auth.handler(c.req.raw));
