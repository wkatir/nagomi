import { beforeEach, describe, expect, mock, test } from "bun:test";
import { d1, migratedDatabase } from "#/db/test-database";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "https://shop.example",
};
mock.module("cloudflare:workers", () => ({ env }));
const { SEO_FILES } = await import("./seo-files");

const read = async (path: string) => {
	const serve = SEO_FILES.get(path);
	if (!serve) throw new Error(`No SEO file at ${path}`);
	return (await serve()).text();
};

beforeEach(() => {
	const db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5);
insert into brands (slug, name, search_key) values ('akko', 'Akko', 'akko');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Teclados'), (1, 'en', 'Keyboards');
insert into products (slug, brand_id, category_id) values ('sakura-65', 1, 1), ('tsuki-keycaps', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado Sakura', 'teclado sakura'), (1, 'en', 'Sakura keyboard', 'sakura keyboard'), (2, 'es', 'Keycaps Tsuki', 'keycaps tsuki'), (2, 'en', 'Tsuki keycaps', 'tsuki keycaps');
insert into variants (product_id, sku, price, search_key) values (1, 'TEC-002', 7499, 'tec-002'), (2, 'TEC-004', 2999, 'tec-004');
update products set status = 'published';
insert into bundles (slug, price) values ('set-sakura', 9999);
insert into bundle_translations (bundle_id, locale, name) values (1, 'es', 'Set Sakura'), (1, 'en', 'Sakura Set');
insert into bundle_items (bundle_id, variant_id, position) values (1, 1, 1), (1, 2, 2);
update bundles set status = 'published';
`);
	env.DB = d1(db);
});

describe("SEO files", () => {
	test("there is a llms.txt for each language, at the address that language uses", () => {
		expect([...SEO_FILES.keys()].sort()).toEqual([
			"/en/llms.txt",
			"/llms.txt",
			"/robots.txt",
			"/sitemap.xml",
		]);
	});

	test("llms.txt links the categories, brands and bundles in the language of the file", async () => {
		const spanish = await read("/llms.txt");
		expect(spanish).toContain(
			"[Teclados](https://shop.example/categories/teclados)",
		);
		expect(spanish).toContain("[Akko](https://shop.example/brands/akko)");
		expect(spanish).toContain(
			"[Set Sakura](https://shop.example/sets/set-sakura)",
		);

		const english = await read("/en/llms.txt");
		expect(english).toContain(
			"[Keyboards](https://shop.example/en/categories/teclados)",
		);
		expect(english).toContain(
			"[Sakura Set](https://shop.example/en/sets/set-sakura)",
		);
		expect(english).not.toContain("Teclados");
	});

	test("the sitemap lists the new pages once per language", async () => {
		const xml = await read("/sitemap.xml");
		for (const path of [
			"/categories/teclados",
			"/brands/akko",
			"/sets",
			"/sets/set-sakura",
		]) {
			expect(xml).toContain(`<loc>https://shop.example${path}</loc>`);
			expect(xml).toContain(`<loc>https://shop.example/en${path}</loc>`);
		}
	});
});
