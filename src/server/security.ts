// TanStack Start inlines its hydration script and styles, hence 'unsafe-inline'.
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
	const { pathname } = new URL(request.url);
	if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/auth"))
		secured.headers.set("Cache-Control", "no-store");
	return secured;
}
