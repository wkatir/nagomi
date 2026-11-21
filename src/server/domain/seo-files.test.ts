import { describe, expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/d1";
import type { Db } from "#/db";
import * as schema from "#/db/schema";
import { d1, migratedDatabase } from "#/db/test-database";

mock.module("cloudflare:workers", () => ({ env: {} }));
const { llmsTxt, robotsTxt, sitemapEntries, sitemapXml } = await import(
	"./seo-files"
);
const { catalogContext } = await import("./storefront-catalog");

const origin = "https://shop.example";

describe("robots.txt", () => {
	const robots = robotsTxt(origin);

	test("keeps crawlers out of the back office and the API in both locales", () => {
		expect(robots).toContain("User-agent: *\n");
		expect(robots).toContain("Disallow: /admin\n");
		expect(robots).toContain("Disallow: /en/admin\n");
		expect(robots).toContain("Disallow: /api/\n");
		expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml\n`);
	});

	test("leaves the store and the cart crawlable", () => {
		const disallowed = robots
			.split("\n")
			.filter((line) => line.startsWith("Disallow:"))
			.map((line) => line.slice("Disallow:".length).trim());
		expect(disallowed).toEqual(["/admin", "/en/admin", "/api/"]);
		expect(robots).not.toMatch(/^Disallow: \/$/m);
	});
});

describe("sitemap.xml", () => {
	test("lists each page once per locale with its alternates", () => {
		const xml = sitemapXml(origin, [
			{ path: "/" },
			{ path: "/products/oil", lastmod: "2026-10-11T12:00:00Z" },
		]);
		expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>\n');
		expect(xml).toContain(
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		);
		const urls = xml.match(/<url>.*?<\/url>/g) ?? [];
		expect(urls.map((u) => u.match(/<loc>(.*?)<\/loc>/)?.[1])).toEqual([
			`${origin}/`,
			`${origin}/en/`,
			`${origin}/products/oil`,
			`${origin}/en/products/oil`,
		]);
		for (const url of urls.slice(2)) {
			expect(url).toContain("<lastmod>2026-10-11T12:00:00Z</lastmod>");
			expect(url).toContain(
				`<xhtml:link rel="alternate" hreflang="es" href="${origin}/products/oil"/>`,
			);
			expect(url).toContain(
				`<xhtml:link rel="alternate" hreflang="en" href="${origin}/en/products/oil"/>`,
			);
			expect(url).toContain(
				`<xhtml:link rel="alternate" hreflang="x-default" href="${origin}/products/oil"/>`,
			);
		}
		expect(urls[0]).not.toContain("<lastmod>");
		expect(xml.trimEnd()).toEndWith("</urlset>");
	});

	test("escapes XML in URLs", () => {
		const xml = sitemapXml(origin, [{ path: "/pages/a&b" }]);
		expect(xml).toContain(`<loc>${origin}/pages/a&amp;b</loc>`);
		expect(xml).not.toContain("a&b");
	});
});

describe("sitemap entries", () => {
	const context = catalogContext(
		{
			defaultLocale: "es",
			timeZone: "America/El_Salvador",
			maxQuantityPerLine: 20,
		},
		"es",
	);

	// Published, draft and archived rows of each kind, written the way the triggers allow (a
	// product is published once it has a priced variant). Only the oil is for sale: the
	// draft cream and the retired product, with their needs, brands and routines, are not.
	function seeded() {
		const raw = migratedDatabase();
		raw.exec(`
insert into brands (slug, name, search_key) values ('skin1004', 'SKIN1004', 'skin1004'), ('face-republic', 'Face Republic', 'face'), ('old-brand', 'Old', 'old');
insert into categories (slug, routine_step) values ('cleanser', 1), ('unused', 2);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Limpiador'), (2, 'es', 'Sin uso');
insert into concerns (slug) values ('pores'), ('dryness');
insert into concern_translations (concern_id, locale, name) values (1, 'es', 'Poros'), (2, 'es', 'Resequedad');
insert into products (slug, brand_id, category_id) values ('oil', 1, 1), ('draft-cream', 2, 1), ('retired', 3, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite'), (2, 'es', 'Crema', 'crema'), (3, 'es', 'Retirado', 'retirado');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL', 1551, 'oil'), (3, 'RET', 900, 'ret');
update products set status = 'published', updated_at = '2026-10-11T12:00:00Z' where slug = 'oil';
update products set status = 'archived' where slug = 'retired';
insert into product_concerns (product_id, concern_id) values (1, 1), (2, 2);
insert into pages (slug, is_published, updated_at) values ('terms', 1, '2026-10-05T00:00:00Z'), ('draft-page', 0, '2026-10-05T00:00:00Z');
insert into routines (slug, status) values ('morning', 'draft'), ('evening', 'published'), ('hidden', 'published');
insert into routine_translations (routine_id, locale, title) values (1, 'es', 'Mañana'), (2, 'es', 'Noche'), (3, 'es', 'Oculta');
insert into routine_items (routine_id, variant_id, position) values (1, 1, 1), (2, 1, 1), (3, 2, 1);
`);
		return drizzle(d1(raw) as unknown as D1Database, {
			schema,
		}) as unknown as Db;
	}

	test("lists what has something to show: the fixed pages, then needs, types, brands and routines, products and pages", async () => {
		expect(await sitemapEntries(seeded(), context)).toEqual([
			{ path: "/" },
			{ path: "/products" },
			{ path: "/routines" },
			{ path: "/company" },
			{ path: "/needs/pores" },
			{ path: "/categories/cleanser" },
			{ path: "/brands/skin1004" },
			{ path: "/routines/evening" },
			{ path: "/products/oil", lastmod: "2026-10-11T12:00:00Z" },
			{ path: "/pages/terms", lastmod: "2026-10-05T00:00:00Z" },
		]);
	});

	test("leaves out the needs, types, brands and routines nothing is for sale under", async () => {
		const paths = (await sitemapEntries(seeded(), context)).map((e) => e.path);
		for (const gone of [
			"/needs/dryness",
			"/categories/unused",
			"/brands/face-republic",
			"/brands/old-brand",
			"/routines/morning",
			"/routines/hidden",
			"/pages/draft-page",
			"/products/draft-cream",
			"/products/retired",
		])
			expect(paths).not.toContain(gone);
	});
});

describe("llms.txt", () => {
	test("title, summary and only the sections that have lines", () => {
		expect(
			llmsTxt({
				name: "Eclalune",
				summary: "Beauty and personal care.",
				sections: [
					{
						title: "Products",
						lines: ["[Oil](https://shop.example/products/oil)"],
					},
					{ title: "Routines", lines: [] },
				],
			}),
		).toBe(
			[
				"# Eclalune",
				"",
				"> Beauty and personal care.",
				"",
				"## Products",
				"",
				"- [Oil](https://shop.example/products/oil)",
				"",
			].join("\n"),
		);
	});
});
