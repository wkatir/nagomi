import type { ProductBadge } from "#/lib/enums";
import { searchKey } from "./search";

// Pure: the published catalogue is small enough to be read whole and refined in memory
// (storefront-catalog.ts loads it).

export const CATALOG_SORTS = [
	"featured",
	"newest",
	"price_asc",
	"price_desc",
	"name",
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const AVAILABILITIES = ["in_stock", "sold_out"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export type Named = { slug: string; name: string };
export type CatalogImage = {
	url: string;
	width: number;
	height: number;
	alt: string;
};
export type CatalogVariant = {
	sku: string;
	// GTIN-14.
	gtin: string | null;
	optionLabel: string | null;
	price: number;
	compareAtPrice: number | null;
	availability: Availability;
	maxQuantity: number;
};

// Approved reviews: the average to one decimal, null without any.
export type Rating = { average: number | null; count: number };

export const ratingOf = (sum: number, count: number): Rating => ({
	average: count === 0 ? null : Math.round((sum * 10) / count) / 10,
	count,
});

export type CatalogEntry = {
	id: number;
	rating: Rating;
	slug: string;
	name: string;
	tagline: string | null;
	shortSpecs: string | null;
	isFeatured: boolean;
	badge: ProductBadge | null;
	warrantyMonths: number;
	brand: Named;
	category: Named & { sortOrder: number };
	collections: { slug: string; position: number }[];
	bundles: string[];
	// Cheapest first: shownVariant relies on it.
	variants: [CatalogVariant, ...CatalogVariant[]];
	packshot: CatalogImage | null;
	lifestyle: CatalogImage | null;
	createdAt: string;
	// searchKey() of what a customer may type.
	searchText: string;
};

export type ProductCard = {
	slug: string;
	rating: Rating;
	name: string;
	tagline: string | null;
	shortSpecs: string | null;
	isFeatured: boolean;
	badge: ProductBadge | null;
	brand: Named;
	category: Named;
	sku: string;
	price: number;
	compareAtPrice: number | null;
	optionLabel: string | null;
	variantsCount: number;
	availability: Availability;
	maxQuantity: number;
	packshot: CatalogImage | null;
	lifestyle: CatalogImage | null;
	createdAt: string;
};

const shownVariant = (e: CatalogEntry) =>
	e.variants.find((v) => v.availability === "in_stock") ?? e.variants[0];

const price = (e: CatalogEntry) => shownVariant(e).price;

export const availabilityOf = (e: CatalogEntry): Availability =>
	e.variants.some((v) => v.availability === "in_stock")
		? "in_stock"
		: "sold_out";

export function toCard(e: CatalogEntry): ProductCard {
	const first = shownVariant(e);
	return {
		slug: e.slug,
		rating: e.rating,
		name: e.name,
		tagline: e.tagline,
		shortSpecs: e.shortSpecs,
		isFeatured: e.isFeatured,
		badge: e.badge,
		brand: e.brand,
		category: { slug: e.category.slug, name: e.category.name },
		sku: first.sku,
		price: first.price,
		compareAtPrice: first.compareAtPrice,
		optionLabel: first.optionLabel,
		variantsCount: e.variants.length,
		availability: first.availability,
		maxQuantity: first.maxQuantity,
		packshot: e.packshot,
		lifestyle: e.lifestyle,
		createdAt: e.createdAt,
	};
}

export type CatalogFilter = {
	q?: string;
	category: string[];
	brand: string[];
	collection: string[];
	// Minor units, inclusive, on the price a card shows.
	minPrice?: number;
	maxPrice?: number;
	availability?: Availability;
	sort: CatalogSort;
	page: number;
	pageSize: number;
};

// Each in display order.
export type FacetDimensions = {
	category: Named[];
	brand: Named[];
	collection: Named[];
};

export type FacetValue = Named & { count: number; selected: boolean };

type Refinement =
	| "category"
	| "brand"
	| "collection"
	| "price"
	| "availability";
const REFINEMENTS: Refinement[] = [
	"category",
	"brand",
	"collection",
	"price",
	"availability",
];

const anyOf = (selected: string[], values: string[]) =>
	selected.length === 0 || values.some((v) => selected.includes(v));

function predicates(
	f: CatalogFilter,
): Record<Refinement, (e: CatalogEntry) => boolean> {
	return {
		category: (e) => anyOf(f.category, [e.category.slug]),
		brand: (e) => anyOf(f.brand, [e.brand.slug]),
		collection: (e) =>
			anyOf(
				f.collection,
				e.collections.map((c) => c.slug),
			),
		price: (e) =>
			(f.minPrice === undefined || price(e) >= f.minPrice) &&
			(f.maxPrice === undefined || price(e) <= f.maxPrice),
		availability: (e) =>
			f.availability === undefined || availabilityOf(e) === f.availability,
	};
}

function matchesSearch(e: CatalogEntry, q: string | undefined) {
	const words = searchKey(q).split(" ").filter(Boolean);
	return words.every((w) => e.searchText.includes(w));
}

// Sold out last in every order, so a customer sees what can be bought first.
function comparator(
	f: Pick<CatalogFilter, "sort" | "collection">,
	locale: string,
) {
	const collator = new Intl.Collator(locale, {
		sensitivity: "base",
		numeric: true,
	});
	const byName = (a: CatalogEntry, b: CatalogEntry) =>
		collator.compare(a.name, b.name) ||
		collator.compare(a.brand.name, b.brand.name) ||
		(a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
	const [only] = f.collection.length === 1 ? f.collection : [];
	const positionIn = (e: CatalogEntry) =>
		e.collections.find((c) => c.slug === only)?.position ??
		Number.POSITIVE_INFINITY;
	const soldOutLast = (a: CatalogEntry, b: CatalogEntry) =>
		Number(availabilityOf(a) === "sold_out") -
		Number(availabilityOf(b) === "sold_out");
	const order = (): ((a: CatalogEntry, b: CatalogEntry) => number) => {
		switch (f.sort) {
			case "featured":
				return (a, b) =>
					(only ? positionIn(a) - positionIn(b) : 0) ||
					Number(b.isFeatured) - Number(a.isFeatured) ||
					a.category.sortOrder - b.category.sortOrder ||
					byName(a, b);
			case "newest":
				return (a, b) =>
					(a.createdAt < b.createdAt
						? 1
						: a.createdAt > b.createdAt
							? -1
							: 0) || b.id - a.id;
			case "price_asc":
				return (a, b) => price(a) - price(b) || byName(a, b);
			case "price_desc":
				return (a, b) => price(b) - price(a) || byName(a, b);
			case "name":
				return byName;
		}
	};
	const ordered = order();
	return (a: CatalogEntry, b: CatalogEntry) =>
		soldOutLast(a, b) || ordered(a, b);
}

export function sortEntries(
	entries: CatalogEntry[],
	locale: string,
	sort: CatalogSort = "featured",
	collection: string[] = [],
) {
	return [...entries].sort(comparator({ sort, collection }, locale));
}

// Standard faceting: a facet's own selection does not narrow its counts. A facet lists the
// values found among the search matches, plus the selected ones.
export function queryCatalog(
	entries: CatalogEntry[],
	dimensions: FacetDimensions,
	f: CatalogFilter,
	locale: string,
) {
	if (!Number.isInteger(f.page) || f.page < 1)
		throw new Error(`Invalid page ${f.page}`);
	if (!Number.isInteger(f.pageSize) || f.pageSize < 1)
		throw new Error(`Invalid page size ${f.pageSize}`);
	const scoped = entries.filter((e) => matchesSearch(e, f.q));
	const test = predicates(f);
	const matching = (except?: Refinement) =>
		scoped.filter((e) => REFINEMENTS.every((r) => r === except || test[r](e)));

	const facet = (
		key: "category" | "brand" | "collection",
		valuesOf: (e: CatalogEntry) => string[],
	): FacetValue[] => {
		const found = new Set(scoped.flatMap(valuesOf));
		const counts = new Map<string, number>();
		for (const e of matching(key))
			for (const slug of new Set(valuesOf(e)))
				counts.set(slug, (counts.get(slug) ?? 0) + 1);
		return dimensions[key]
			.filter((d) => found.has(d.slug) || f[key].includes(d.slug))
			.map((d) => ({
				...d,
				count: counts.get(d.slug) ?? 0,
				selected: f[key].includes(d.slug),
			}));
	};

	const forAvailability = matching("availability");
	const forPrice = matching("price").map(price);
	const items = matching().sort(comparator(f, locale));
	const start = (f.page - 1) * f.pageSize;
	return {
		items: items.slice(start, start + f.pageSize).map(toCard),
		total: items.length,
		page: f.page,
		pageSize: f.pageSize,
		pageCount: Math.max(1, Math.ceil(items.length / f.pageSize)),
		facets: {
			category: facet("category", (e) => [e.category.slug]),
			brand: facet("brand", (e) => [e.brand.slug]),
			collection: facet("collection", (e) => e.collections.map((c) => c.slug)),
			availability: AVAILABILITIES.map((value) => ({
				value,
				count: forAvailability.filter((e) => availabilityOf(e) === value)
					.length,
				selected: f.availability === value,
			})),
		},
		priceRange:
			forPrice.length === 0
				? null
				: { min: Math.min(...forPrice), max: Math.max(...forPrice) },
	};
}
