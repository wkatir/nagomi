const ADMIN_HOME = "/admin";
const BASE = new URL("https://eclalune.invalid");
const ADMIN_PATH = /^\/(en\/)?admin(\/|$)/;

// Parsed like a browser would, so tab, newline and backslash tricks cannot leave the admin.
export function safeRedirect(target: string | undefined): string {
	if (!target?.startsWith("/")) return ADMIN_HOME;
	const url = new URL(target, BASE);
	if (url.origin !== BASE.origin || !ADMIN_PATH.test(url.pathname))
		return ADMIN_HOME;
	return url.pathname + url.search + url.hash;
}
