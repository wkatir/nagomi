// Headers on every response (pages and API). The Content-Security-Policy is report-only
// until it has run against the real site: TanStack Start inlines its hydration script and
// styles, so script and style allow 'unsafe-inline' for now. No reporting endpoint is
// configured, so violations only show in the browser console.
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
].join("; ");

const HEADERS = {
	"Content-Security-Policy-Report-Only": CSP,
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Frame-Options": "DENY",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
} as const;

export function withSecurityHeaders(request: Request, response: Response) {
	const secured = new Response(response.body, response);
	for (const [name, value] of Object.entries(HEADERS))
		secured.headers.set(name, value);
	// Admin data (customers, phones) is never cached by the browser or a proxy.
	const { pathname } = new URL(request.url);
	if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/auth"))
		secured.headers.set("Cache-Control", "no-store");
	return secured;
}
