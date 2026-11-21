import { SLUG_REGEX } from "#/lib/enums";

// eclalune.com served a real estate marketing site before the store. Its pages answer 410
// so search engines drop them for good instead of retrying a 404.
const RETIRED_PATH =
	/^\/(es\/)?(intelligence|lead-generation|research|white-label)\/?$/;

export const isRetiredPath = (pathname: string) => RETIRED_PATH.test(pathname);

export const gone = () =>
	new Response("Gone", {
		status: 410,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"X-Robots-Tag": "noindex",
		},
	});

// The list filtered by only one need, type or brand (/products?concern=pores), an old
// address, moves to that facet's page for good. Decided here, for document requests only:
// inside the app the same list is a filter that must stay a list.
const LISTING = /^(\/en)?\/products\/?$/;
const FACET_PAGES = {
	concern: "needs",
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
