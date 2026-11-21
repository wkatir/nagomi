import { eq } from "drizzle-orm";
import type { Db } from "#/db";
import { pages, products } from "#/db/schema";
import { localizedUrl } from "#/lib/seo";
import { baseLocale, locales } from "#/paraglide/runtime";
import type { CatalogContext } from "./catalog";
import { loadCatalog } from "./storefront-catalog";

// `path` has no locale prefix.
export type SitemapEntry = { path: string; lastmod?: string };

// Needs, categories, brands and routines follow the same rule as the menu and the pages
// themselves.
export async function sitemapEntries(
	db: Db,
	context: CatalogContext,
): Promise<SitemapEntry[]> {
	const [publishedProducts, publishedPages, catalog] = await Promise.all([
		db
			.select({ slug: products.slug, updatedAt: products.updatedAt })
			.from(products)
			.where(eq(products.status, "published"))
			.orderBy(products.slug),
		db
			.select({ slug: pages.slug, updatedAt: pages.updatedAt })
			.from(pages)
			.where(eq(pages.isPublished, true))
			.orderBy(pages.slug),
		loadCatalog(db, context),
	]);
	const { concern, category, brand } = catalog.dimensions;
	return [
		{ path: "/" },
		{ path: "/products" },
		{ path: "/routines" },
		{ path: "/company" },
		...concern.map((x) => ({ path: `/needs/${x.slug}` })),
		...category.map((x) => ({ path: `/categories/${x.slug}` })),
		...brand.map((x) => ({ path: `/brands/${x.slug}` })),
		...catalog.routines.map((r) => ({ path: `/routines/${r.slug}` })),
		...publishedProducts.map((p) => ({
			path: `/products/${p.slug}`,
			lastmod: p.updatedAt,
		})),
		...publishedPages.map((p) => ({
			path: `/pages/${p.slug}`,
			lastmod: p.updatedAt,
		})),
	];
}

const XML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};
const xml = (text: string) => text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

// Every locale's URL and x-default as alternates:
// https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap
export function sitemapXml(origin: string, entries: readonly SitemapEntry[]) {
	const urls = entries.flatMap(({ path, lastmod }) => {
		const alternates = [
			...locales.map((l) => [l, localizedUrl(origin, path, l)]),
			["x-default", localizedUrl(origin, path, baseLocale)],
		].map(
			([lang, href]) =>
				`<xhtml:link rel="alternate" hreflang="${lang}" href="${xml(href)}"/>`,
		);
		return locales.map((l) =>
			[
				"<url>",
				`<loc>${xml(localizedUrl(origin, path, l))}</loc>`,
				...(lastmod ? [`<lastmod>${xml(lastmod)}</lastmod>`] : []),
				...alternates,
				"</url>",
			].join(""),
		);
	});
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...urls,
		"</urlset>",
		"",
	].join("\n");
}

// The back office and the API are not for crawlers. The cart is crawlable on purpose: it is
// linked from every page and carries noindex, which Google only sees on pages it may crawl.
export function robotsTxt(origin: string) {
	const admin = locales.map(
		(l) => new URL(localizedUrl(origin, "/admin", l)).pathname,
	);
	return [
		"User-agent: *",
		...admin.map((path) => `Disallow: ${path}`),
		"Disallow: /api/",
		"",
		`Sitemap: ${origin}/sitemap.xml`,
		"",
	].join("\n");
}

// https://llmstxt.org
export function llmsTxt(doc: {
	name: string;
	summary: string;
	sections: readonly { title: string; lines: readonly string[] }[];
}) {
	return [
		`# ${doc.name}`,
		"",
		`> ${doc.summary}`,
		...doc.sections
			.filter((s) => s.lines.length > 0)
			.flatMap((s) => [
				"",
				`## ${s.title}`,
				"",
				...s.lines.map((l) => `- ${l}`),
			]),
		"",
	].join("\n");
}
