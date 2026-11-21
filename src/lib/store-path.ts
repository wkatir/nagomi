import { LOCALES } from "#/lib/enums";

const NOT_PAGES = ["/api", "/admin", "/media"];

// No backslashes: browsers read "/\" as "//", another host. No locale prefix: the
// storefront adds the visitor's. The table CHECK repeats the character rules.
export function isStorePath(path: string): boolean {
	if (!/^\/(?!\/)[!-[\]-~]*$/.test(path) || path.length > 300) return false;
	const base = "https://store.invalid";
	const url = new URL(path, base);
	if (url.origin !== base) return false;
	const first = `/${url.pathname.split("/")[1]}`;
	return !NOT_PAGES.includes(first) && !LOCALES.some((l) => first === `/${l}`);
}
