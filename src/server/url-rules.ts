import { SLUG_REGEX } from "#/lib/enums";

// /products?brand=akko moves to /brands/akko for document requests only: inside the app the
// same list is a filter.
const LISTING = /^(\/en)?\/products\/?$/;
const FACET_PAGES = {
	category: "categories",
	brand: "brands",
} as const;

export function movedTo(url: URL): string | null {
	const listing = LISTING.exec(url.pathname);
	const entries = [...url.searchParams.entries()];
	const [only] = entries;
	if (!listing || entries.length !== 1) return null;
	const [facet, slug] = only;
	if (!(facet in FACET_PAGES) || slug.length > 80 || !SLUG_REGEX.test(slug))
		return null;
	return `${listing[1] ?? ""}/${FACET_PAGES[facet as keyof typeof FACET_PAGES]}/${slug}`;
}

export const moved = (location: string, origin: string) =>
	new Response(null, {
		status: 301,
		headers: { Location: new URL(location, origin).href },
	});
