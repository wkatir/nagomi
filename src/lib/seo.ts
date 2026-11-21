import { type Trail, trailItems } from "#/lib/crumbs";
import type { Locale } from "#/lib/enums";
import { pageTitle } from "#/lib/head";
import { moneyInput } from "#/lib/money";
import { baseLocale, locales, localizeUrl } from "#/paraglide/runtime";

// Every URL is absolute, built from `origin` (siteOrigin()) and a route path without its
// locale prefix, which Paraglide localizes: es at /…, en at /en/….

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		noindex?: boolean;
	}
}

type Match = { pathname: string; staticData: { noindex?: boolean } };
type Meta = Record<string, unknown>;
type JsonLdValue = string | number | boolean | null | JsonLd | JsonLdValue[];
export type JsonLd = { [key: string]: JsonLdValue | undefined };

export type StoreIdentity = {
	name: string;
	countryCode: string;
	whatsappNumber: string | null;
	business: {
		legalName: string | null;
		email: string | null;
		phone: string | null;
	};
};

const OG_IMAGE = { width: 1200, height: 630 } as const;
const OG_IMAGE_PATH: Record<Locale, string> = {
	es: "/og-default.png",
	en: "/og-default-en.png",
};
const LOGO_PATH = "/logo.png";

export function localizedUrl(origin: string, path: string, locale: Locale) {
	return localizeUrl(new URL(path, origin), { locale }).href;
}

export function pagePath(matches: readonly Match[]) {
	const leaf = matches.at(-1);
	if (!leaf) throw new Error("pagePath needs the route matches");
	return leaf.pathname === "/" ? "/" : leaf.pathname.replace(/\/+$/, "");
}

export const isNoindex = (matches: readonly Match[]) =>
	matches.some((m) => m.staticData.noindex === true);

// Search parameters are left out: filtered listings point at the listing.
export function alternateLinks(origin: string, path: string, locale: Locale) {
	return [
		{ rel: "canonical", href: localizedUrl(origin, path, locale) },
		...locales.map((l) => ({
			rel: "alternate",
			hrefLang: l,
			href: localizedUrl(origin, path, l),
		})),
		{
			rel: "alternate",
			hrefLang: "x-default",
			href: localizedUrl(origin, path, baseLocale),
		},
	];
}

const ogLocale = (locale: Locale, countryCode: string) =>
	`${locale}_${countryCode}`;

export type OgImage = {
	url: string;
	width: number;
	height: number;
	alt: string;
};

export function ogImageMeta(image: OgImage): Meta[] {
	return [
		{ property: "og:image", content: image.url },
		{ property: "og:image:width", content: String(image.width) },
		{ property: "og:image:height", content: String(image.height) },
		{ property: "og:image:alt", content: image.alt },
	];
}

// Facebook needs at least 200 x 200 for a link preview.
export const shareImage = <T extends OgImage>(images: readonly T[]) =>
	images
		.filter((i) => i.width >= 200 && i.height >= 200)
		.sort((a, b) => b.width * b.height - a.width * a.height)[0];

const defaultOgImage = (
	origin: string,
	locale: Locale,
	alt: string,
): OgImage => ({ url: `${origin}${OG_IMAGE_PATH[locale]}`, ...OG_IMAGE, alt });

// Store pages get the site-wide Open Graph tags from the store layout; a page overrides
// them with this.
export function pageMeta({
	title,
	storeName,
	description,
}: {
	title: string;
	storeName: string;
	description?: string | null;
}): Meta[] {
	return [
		pageTitle(title, storeName),
		{ property: "og:title", content: title },
		...(description
			? [
					{ name: "description", content: description },
					{ property: "og:description", content: description },
				]
			: []),
	];
}

export const jsonLdMeta = (data: JsonLd): Meta => ({ "script:ld+json": data });

// The Organization and WebSite data go on the home page: they give Google the site name
// and logo.
export function storeHead({
	origin,
	locale,
	path,
	noindex,
	store,
	title,
	description,
}: {
	origin: string;
	locale: Locale;
	path: string;
	noindex: boolean;
	store: StoreIdentity;
	title: string;
	description: string;
}) {
	const others = locales.filter((l) => l !== locale);
	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: store.name },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: localizedUrl(origin, path, locale) },
			{ property: "og:locale", content: ogLocale(locale, store.countryCode) },
			...others.map((l) => ({
				property: "og:locale:alternate",
				content: ogLocale(l, store.countryCode),
			})),
			...ogImageMeta(defaultOgImage(origin, locale, store.name)),
			{ name: "twitter:card", content: "summary_large_image" },
			...(path === "/" && !noindex
				? [
						jsonLdMeta(organizationJsonLd(origin, store, description)),
						jsonLdMeta(webSiteJsonLd(origin, store, locale)),
					]
				: []),
		],
		links: noindex ? [] : alternateLinks(origin, path, locale),
	};
}

// Numbers are stored with or without the plus sign.
const e164 = (phone: string) => `+${phone.replace(/\D/g, "")}`;

export const organizationId = (origin: string) => `${origin}/#organization`;

export function organizationJsonLd(
	origin: string,
	store: StoreIdentity,
	description: string,
): JsonLd {
	const { legalName, email, phone } = store.business;
	return {
		"@context": "https://schema.org",
		"@type": "OnlineStore",
		"@id": organizationId(origin),
		name: store.name,
		description,
		legalName: legalName ?? undefined,
		url: `${origin}/`,
		logo: `${origin}${LOGO_PATH}`,
		email: email ?? undefined,
		telephone: phone ? e164(phone) : undefined,
		areaServed: store.countryCode,
		contactPoint: store.whatsappNumber
			? {
					"@type": "ContactPoint",
					contactType: "customer service",
					telephone: e164(store.whatsappNumber),
					email: email ?? undefined,
					areaServed: store.countryCode,
					availableLanguage: [...locales],
				}
			: undefined,
	};
}

// `name` is the site name Google shows.
export function webSiteJsonLd(
	origin: string,
	store: StoreIdentity,
	locale: Locale,
): JsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${origin}/#website`,
		name: store.name,
		url: `${origin}/`,
		publisher: { "@id": organizationId(origin) },
		potentialAction: {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: `${localizedUrl(origin, "/products", locale)}?q={search_term_string}`,
			},
			"query-input": "required name=search_term_string",
		},
	};
}

export type Availability = "InStock" | "BackOrder" | "PreOrder" | "OutOfStock";

// A product without sellable units cannot be ordered (src/server/domain/stock.ts).
export const stockAvailability = (
	availability: "in_stock" | "sold_out",
): Availability => (availability === "in_stock" ? "InStock" : "OutOfStock");

export function productJsonLd(p: {
	url: string;
	name: string;
	brand: string;
	description: string | null;
	images: string[];
	sku: string;
	price: number;
	currency: string;
	availability: Availability;
	seller: string;
}): JsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "Product",
		name: p.name,
		brand: { "@type": "Brand", name: p.brand },
		description: p.description ?? undefined,
		image: p.images,
		sku: p.sku,
		url: p.url,
		offers: {
			"@type": "Offer",
			url: p.url,
			price: moneyInput(p.price, p.currency),
			priceCurrency: p.currency,
			availability: `https://schema.org/${p.availability}`,
			itemCondition: "https://schema.org/NewCondition",
			seller: { "@type": "Organization", name: p.seller },
		},
	};
}

export function collectionPageJsonLd(p: {
	origin: string;
	url: string;
	name: string;
	description: string | null;
	items: readonly { name: string; url: string }[];
}): JsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		name: p.name,
		description: p.description ?? undefined,
		url: p.url,
		isPartOf: { "@id": `${p.origin}/#website` },
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: p.items.length,
			itemListElement: p.items.map((item, i) => ({
				"@type": "ListItem",
				position: i + 1,
				name: item.name,
				url: item.url,
			})),
		},
	};
}

export function listPageMeta({
	origin,
	locale,
	storeName,
	title,
	description,
	trail,
	items,
}: {
	origin: string;
	locale: Locale;
	storeName: string;
	title: string;
	description: string | null;
	trail: Trail;
	items: readonly { name: string; path: string }[];
}): Meta[] {
	const url = localizedUrl(origin, trail.current.path, locale);
	return [
		...pageMeta({ title, storeName, description }),
		jsonLdMeta(
			collectionPageJsonLd({
				origin,
				url,
				name: trail.current.name,
				description,
				items: items.map((item) => ({
					name: item.name,
					url: localizedUrl(origin, item.path, locale),
				})),
			}),
		),
		jsonLdMeta(
			breadcrumbJsonLd(
				trailItems(trail).map((item) => ({
					name: item.name,
					url: localizedUrl(origin, item.path, locale),
				})),
			),
		),
	];
}

export function breadcrumbJsonLd(
	items: readonly { name: string; url: string }[],
): JsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: item.name,
			item: item.url,
		})),
	};
}
