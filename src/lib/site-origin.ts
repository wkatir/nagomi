import { env } from "cloudflare:workers";
import { createIsomorphicFn } from "@tanstack/react-start";

// BETTER_AUTH_URL on the server, so it does not depend on the Host a request came with; the
// browser's own origin is the same one.
export const siteOrigin = createIsomorphicFn()
	.server(() => new URL(env.BETTER_AUTH_URL).origin)
	.client(() => window.location.origin);
