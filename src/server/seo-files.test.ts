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
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 180);
insert into brands (slug, name, search_key) values ('anua', 'Anua', 'anua');
insert into categories (slug, routine_step) values ('serum', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Sérum'), (1, 'en', 'Serum');
insert into concerns (slug) values ('pores');
insert into concern_translations (concern_id, locale, name) values (1, 'es', 'Poros'), (1, 'en', 'Pores');
insert into products (slug, brand_id, category_id) values ('serum-1', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Sérum uno', 'serum uno'), (1, 'en', 'Serum one', 'serum one');
insert into variants (product_id, sku, price, search_key) values (1, 'S1', 1500, 's1');
update products set status = 'published' where id = 1;
insert into product_concerns (product_id, concern_id) values (1, 1);
insert into routines (slug, status) values ('morning', 'published');
insert into routine_translations (routine_id, locale, title) values (1, 'es', 'Mañana'), (1, 'en', 'Morning');
insert into routine_items (routine_id, variant_id, position) values (1, 1, 1);
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

	test("llms.txt links the needs, types, brands and routines in the language of the file", async () => {
		const spanish = await read("/llms.txt");
		expect(spanish).toContain("[Poros](https://shop.example/needs/pores)");
		expect(spanish).toContain("[Sérum](https://shop.example/categories/serum)");
		expect(spanish).toContain("[Anua](https://shop.example/brands/anua)");
		expect(spanish).toContain(
			"[Mañana](https://shop.example/routines/morning)",
		);

		const english = await read("/en/llms.txt");
		expect(english).toContain("[Pores](https://shop.example/en/needs/pores)");
		expect(english).toContain(
			"[Serum](https://shop.example/en/categories/serum)",
		);
		expect(english).toContain(
			"[Morning](https://shop.example/en/routines/morning)",
		);
		expect(english).not.toContain("Poros");
	});

	test("the sitemap lists the new pages once per language", async () => {
		const xml = await read("/sitemap.xml");
		for (const path of [
			"/needs/pores",
			"/categories/serum",
			"/brands/anua",
			"/routines",
			"/routines/morning",
		]) {
			expect(xml).toContain(`<loc>https://shop.example${path}</loc>`);
			expect(xml).toContain(`<loc>https://shop.example/en${path}</loc>`);
		}
	});
});
