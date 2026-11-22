import { beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { Hono } from "hono";
import { hc } from "hono/client";
import { d1, migratedDatabase } from "#/db/test-database";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { storeCatalog } = await import("#/server/routes/store-catalog");
const app = new Hono().basePath("/api").route("/", storeCatalog);
// The mock lasts the whole test run, so it keeps the module's other exports.
const realApi = await import("#/lib/api");
mock.module("#/lib/api", () => ({
	...realApi,
	api: () =>
		hc<typeof app>("http://localhost", {
			fetch: (input: RequestInfo | URL, init?: RequestInit) =>
				app.fetch(new Request(input, init)),
		}).api,
}));
const { productPageQuery } = await import("./queries");
const { listingFilter, listingSearch } = await import("./listing");

// One product more than the API's largest page (60), so the list takes two requests.
const PRODUCTS = 61;
// Product n costs 1000 + n; every third one has units; odd ones are keyboards, even ones
// mice.
const inStock = (n: number) => n % 3 === 0;

beforeEach(() => {
	const db = migratedDatabase();
	const rows: string[] = [
		`insert into store_settings (id, name, currency, default_locale, whatsapp_number, legal_name, tax_id_label, tax_id, address, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', '50360000000', 'Store, S.A.S.', 'NIT', '0614-010101-101-1', 'San Salvador', 'America/El_Salvador', 'SV', 'NAG', 20, 5);`,
		"insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');",
		"insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1), ('ratones', 'mouse', 2);",
		"insert into category_translations (category_id, locale, name) values (1, 'es', 'Teclados'), (2, 'es', 'Ratones');",
		"insert into suppliers (name, search_key) values ('Supplier', 'supplier');",
		"insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');",
		"insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');",
	];
	let lot = 0;
	for (let n = 1; n <= PRODUCTS; n++) {
		rows.push(
			`insert into products (slug, brand_id, category_id) values ('p-${n}', 1, ${n % 2 ? 1 : 2});`,
			`insert into product_translations (product_id, locale, name, search_key) values (${n}, 'es', 'Product ${n}', 'product ${n}');`,
			`insert into variants (product_id, sku, price, search_key) values (${n}, 'TEC-${String(n).padStart(3, "0")}', ${1000 + n}, 'tec-${n}');`,
			`update products set status = 'published' where id = ${n};`,
		);
		if (inStock(n)) {
			lot++;
			rows.push(
				`insert into purchase_order_items (id, purchase_order_id, variant_id, quantity, unit_cost) values (${lot}, 1, ${n}, 3, 700);`,
				`insert into purchase_receipt_lines (id, receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (${lot}, 1, ${lot}, 3, 0);`,
				`insert into lots (id, variant_id, receipt_line_id, unit_cost_e4) values (${lot}, ${n}, ${lot}, 70000);`,
				`insert into inventory_movements (lot_id, kind, quantity, created_by) values (${lot}, 'receive', 3, 'u');`,
			);
		}
	}
	db.exec(rows.join("\n"));
	env.DB = d1(db);
});

const page = (n: number, search: Record<string, unknown> = {}) =>
	new QueryClient().fetchQuery(
		productPageQuery(listingFilter("es", listingSearch.parse(search)), n),
	);
const numbers = (items: { slug: string }[]) =>
	items.map((i) => Number(i.slug.slice(2)));
const all = Array.from({ length: PRODUCTS }, (_, i) => i + 1);

describe("productPageQuery", () => {
	test("is one page at a time, in the order asked, sold-out products last", async () => {
		const ordered = [...all.filter(inStock), ...all.filter((n) => !inStock(n))];
		const first = await page(1, { sort: "price_asc" });
		expect(first).toMatchObject({ total: PRODUCTS, page: 1, pageCount: 3 });
		expect(numbers(first.items)).toEqual(ordered.slice(0, 24));
		const second = await page(2, { sort: "price_asc" });
		expect(numbers(second.items)).toEqual(ordered.slice(24, 48));
		expect(numbers((await page(3, { sort: "price_asc" })).items)).toEqual(
			ordered.slice(48),
		);
		expect(numbers((await page(1, { sort: "price_desc" })).items)[0]).toBe(60);
	});

	test("every page is its own cache entry", () => {
		const filter = listingFilter("es", {});
		expect(productPageQuery(filter, 1).queryKey).not.toEqual(
			productPageQuery(filter, 2).queryKey,
		);
		expect(productPageQuery(filter, 1).queryKey).toEqual(
			productPageQuery(listingFilter("es", {}), 1).queryKey,
		);
	});

	test("refines by a category and marks it in the facets", async () => {
		const { total, items, facets } = await page(1, {
			category: "teclados",
			sort: "price_asc",
		});
		expect(total).toBe(31);
		expect(numbers(items).slice(0, 3)).toEqual([3, 9, 15]);
		expect(facets.category).toEqual([
			{ slug: "teclados", name: "Teclados", count: 31, selected: true },
			{ slug: "ratones", name: "Ratones", count: 30, selected: false },
		]);
	});

	test("only what is in stock, when asked", async () => {
		const { total, items } = await page(1, { availability: "in_stock" });
		expect(total).toBe(all.filter(inStock).length);
		expect(items.every((i) => i.availability === "in_stock")).toBe(true);
	});

	test("a category or brand that does not exist is not among the facets", async () => {
		const { total, facets } = await page(1, {
			brand: "logitech",
			category: "sillas",
		});
		expect(total).toBe(0);
		expect(facets.brand.some((c) => c.selected)).toBe(false);
		expect(facets.category.some((c) => c.selected)).toBe(false);
	});
});
