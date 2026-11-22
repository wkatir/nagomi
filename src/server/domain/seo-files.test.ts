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
			{ path: "/products/keyboard", lastmod: "2026-10-11T12:00:00Z" },
		]);
		expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>\n');
		expect(xml).toContain(
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		);
		const urls = xml.match(/<url>.*?<\/url>/g) ?? [];
		expect(urls.map((u) => u.match(/<loc>(.*?)<\/loc>/)?.[1])).toEqual([
			`${origin}/`,
			`${origin}/en/`,
			`${origin}/products/keyboard`,
			`${origin}/en/products/keyboard`,
		]);
		for (const url of urls.slice(2)) {
			expect(url).toContain("<lastmod>2026-10-11T12:00:00Z</lastmod>");
			expect(url).toContain(
				`<xhtml:link rel="alternate" hreflang="es" href="${origin}/products/keyboard"/>`,
			);
			expect(url).toContain(
				`<xhtml:link rel="alternate" hreflang="en" href="${origin}/en/products/keyboard"/>`,
			);
			expect(url).toContain(
				`<xhtml:link rel="alternate" hreflang="x-default" href="${origin}/products/keyboard"/>`,
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
	// product is published once it has a priced variant). Only the keyboard is for sale: the
	// draft mouse and the retired product, with their brands and bundles, are not.
	function seeded() {
		const raw = migratedDatabase();
		raw.exec(`
insert into brands (slug, name, search_key) values ('keychron', 'Keychron', 'keychron'), ('logitech', 'Logitech', 'logitech'), ('old-brand', 'Old', 'old');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1), ('unused', 'package', 2);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Teclados'), (2, 'es', 'Sin uso');
insert into products (slug, brand_id, category_id) values ('keyboard', 1, 1), ('draft-mouse', 2, 1), ('retired', 3, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado', 'teclado'), (2, 'es', 'Ratón', 'raton'), (3, 'es', 'Retirado', 'retirado');
insert into variants (product_id, sku, price, search_key) values (1, 'KBD-001', 1551, 'kbd'), (3, 'RET-001', 900, 'ret'), (1, 'KBD-002', 1000, 'kbd 2');
update products set status = 'published', updated_at = '2026-10-11T12:00:00Z' where slug = 'keyboard';
update products set status = 'archived' where slug = 'retired';
insert into pages (slug, is_published, updated_at) values ('terms', 1, '2026-10-05T00:00:00Z'), ('draft-page', 0, '2026-10-05T00:00:00Z');
insert into bundles (slug, price) values ('starter', 100), ('streaming', 100);
insert into bundle_translations (bundle_id, locale, name) values (1, 'es', 'Kit inicial'), (2, 'es', 'Kit streaming');
insert into bundle_items (bundle_id, variant_id, position) values (1, 1, 1), (2, 1, 1), (2, 3, 2);
update bundles set status = 'published' where slug = 'streaming';
`);
		return drizzle(d1(raw) as unknown as D1Database, {
			schema,
		}) as unknown as Db;
	}

	test("lists what has something to show: the fixed pages, then categories, brands and bundles, products and pages", async () => {
		expect(await sitemapEntries(seeded(), context)).toEqual([
			{ path: "/" },
			{ path: "/products" },
			{ path: "/sets" },
			{ path: "/categories/teclados" },
			{ path: "/brands/keychron" },
			{ path: "/sets/streaming" },
			{ path: "/products/keyboard", lastmod: "2026-10-11T12:00:00Z" },
			{ path: "/pages/terms", lastmod: "2026-10-05T00:00:00Z" },
		]);
	});

	test("leaves out the categories, brands and bundles nothing is for sale under", async () => {
		const paths = (await sitemapEntries(seeded(), context)).map((e) => e.path);
		for (const gone of [
			"/categories/unused",
			"/brands/logitech",
			"/brands/old-brand",
			"/sets/starter",
			"/pages/draft-page",
			"/products/draft-mouse",
			"/products/retired",
		])
			expect(paths).not.toContain(gone);
	});
});

describe("llms.txt", () => {
	test("title, summary and only the sections that have lines", () => {
		expect(
			llmsTxt({
				name: "Nagomi",
				summary: "Computer peripherals and desk setups.",
				sections: [
					{
						title: "Products",
						lines: ["[Keyboard](https://shop.example/products/keyboard)"],
					},
					{ title: "Sets", lines: [] },
				],
			}),
		).toBe(
			[
				"# Nagomi",
				"",
				"> Computer peripherals and desk setups.",
				"",
				"## Products",
				"",
				"- [Keyboard](https://shop.example/products/keyboard)",
				"",
			].join("\n"),
		);
	});
});
