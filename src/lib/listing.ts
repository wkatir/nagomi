import { z } from "zod";
import { type Locale, SLUG_REGEX } from "#/lib/enums";
import type { CatalogSort } from "#/server/domain/catalog-query";

// Values of one facet are alternatives and travel as one comma-separated parameter
// (?brand=akko,pulsar), so a link with a single value (?brand=akko) is still valid.

// The first is the API's default.
export const SORTS = [
	"featured",
	"rating",
	"price_asc",
	"price_desc",
	"newest",
] as const satisfies readonly CatalogSort[];

export const LISTING_PAGE_SIZE = 24;

// In the order the filters show them.
export const FACETS = ["category", "brand"] as const;
export type Facet = (typeof FACETS)[number];

// The router reads a numeric-looking value as a number; the coercion keeps it a string.
const list = z.coerce.string<string>().optional();

export const listingSearch = z.object({
	q: z
		.string()
		.trim()
		.max(80)
		.optional()
		.catch(undefined)
		.transform((q) => q || undefined),
	category: list,
	brand: list,
	availability: z.literal("in_stock").optional().catch(undefined),
	minPrice: z.coerce
		.number()
		.int()
		.min(0)
		.max(100_000_000)
		.optional()
		.catch(undefined),
	maxPrice: z.coerce
		.number()
		.int()
		.min(0)
		.max(100_000_000)
		.optional()
		.catch(undefined),
	sort: z.enum(SORTS).optional().catch(undefined),
	// How many pages are shown: "Ver más" adds the next one.
	page: z.coerce.number().int().min(1).max(50).optional().catch(undefined),
});
// Every key is optional: the transform on `q` would otherwise make it required.
export type ListingSearch = Partial<z.output<typeof listingSearch>>;

export type ListingScope = Partial<Record<Facet, string>>;

export const listOf = (value: string | undefined) =>
	value ? value.split(",").filter(Boolean) : [];
const join = (values: string[]) =>
	values.length > 0 ? values.join(",") : undefined;

const refined = (search: ListingSearch, change: Partial<ListingSearch>) => ({
	...search,
	...change,
	page: undefined,
});

export function toggle(
	search: ListingSearch,
	facet: Facet,
	value: string,
): ListingSearch {
	const current = listOf(search[facet]);
	const next = current.includes(value)
		? current.filter((v) => v !== value)
		: [...current, value];
	return refined(search, { [facet]: join(next) });
}

export const setAvailability = (search: ListingSearch, on: boolean) =>
	refined(search, { availability: on ? "in_stock" : undefined });

export const setPrice = (
	search: ListingSearch,
	minPrice: number | undefined,
	maxPrice: number | undefined,
) =>
	refined(search, {
		minPrice,
		maxPrice:
			minPrice !== undefined && maxPrice !== undefined && maxPrice < minPrice
				? minPrice
				: maxPrice,
	});

export const setSort = (search: ListingSearch, sort: ListingSearch["sort"]) =>
	refined(search, { sort: sort === SORTS[0] ? undefined : sort });

export const setQuery = (search: ListingSearch, q: string | undefined) =>
	refined(search, { q });

export const showMore = (search: ListingSearch): ListingSearch => ({
	...search,
	page: (search.page ?? 1) + 1,
});

export const clearFilters = (search: ListingSearch): ListingSearch =>
	refined(search, {
		category: undefined,
		brand: undefined,
		availability: undefined,
		minPrice: undefined,
		maxPrice: undefined,
	});

// The search is left out: it has its own box.
export const activeCount = (search: ListingSearch) =>
	FACETS.reduce((n, facet) => n + listOf(search[facet]).length, 0) +
	(search.availability ? 1 : 0) +
	(search.minPrice !== undefined || search.maxPrice !== undefined ? 1 : 0);

// Equal searches give equal filters, so the cache can share their pages.
export type ListingFilter = {
	locale: Locale;
	q?: string;
	category: string[];
	brand: string[];
	availability?: "in_stock";
	minPrice?: number;
	maxPrice?: number;
	sort: CatalogSort;
};

export function listingFilter(
	locale: Locale,
	search: ListingSearch,
	scope: ListingScope = {},
): ListingFilter {
	const values = (facet: Facet) => [
		...(scope[facet] ? [scope[facet]] : []),
		...listOf(search[facet]),
	];
	return {
		locale,
		q: search.q,
		category: values("category"),
		brand: values("brand"),
		availability: search.availability,
		minPrice: search.minPrice,
		maxPrice: search.maxPrice,
		sort: search.sort ?? SORTS[0],
	};
}

// The API refuses what is not a slug, and nothing has such a name: a search with one is
// for a page that does not exist.
export const isKnownKind = (search: ListingSearch) =>
	FACETS.every((facet) =>
		listOf(search[facet]).every(
			(value) => value.length <= 80 && SLUG_REGEX.test(value),
		),
	);

// A value the facets do not list is a category or brand with no products (or none at
// all): a page that does not exist.
export const hasUnknownValue = (
	search: ListingSearch,
	facets: Record<Facet, { slug: string; selected: boolean }[]>,
) =>
	FACETS.some((facet) =>
		listOf(search[facet]).some(
			(value) => !facets[facet].some((v) => v.slug === value && v.selected),
		),
	);

export const pagesOf = (search: ListingSearch) =>
	Array.from({ length: search.page ?? 1 }, (_, i) => i + 1);
