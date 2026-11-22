import { describe, expect, test } from "bun:test";
import type { ProductListSearch } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { render } from "./harness";
import { ProductsTable } from "./products-table";
import { type ProductRow, productsQuery } from "./queries";
import { productSearchDefaults } from "./search";

const row = (change: Partial<ProductRow>): ProductRow => ({
	id: 1,
	slug: "teclado-akko",
	status: "published",
	createdAt: "2026-01-01T00:00:00Z",
	name: "Teclado Akko",
	brand: "Marca Uno",
	category: "Accesorios",
	variantCount: 2,
	priceFrom: 1500,
	priceTo: 2500,
	stock: 52,
	photoUrl: "/media/a.jpg",
	...change,
});

function table(items: ProductRow[], change: Partial<ProductListSearch> = {}) {
	const search = { ...productSearchDefaults, ...change };
	return render(
		<ProductsTable search={search} onSearchChange={() => {}} />,
		(queryClient) =>
			queryClient.setQueryData(productsQuery(search).queryKey, {
				items,
				total: items.length,
				page: 1,
				pageSize: 25,
				pageCount: 1,
			}),
	);
}

describe("ProductsTable", () => {
	const html = table([
		row({}),
		row({
			id: 2,
			slug: "raton-pulsar",
			status: "draft",
			name: "Ratón Pulsar",
			brand: "Marca Dos",
			variantCount: 0,
			priceFrom: null,
			priceTo: null,
			stock: 0,
			photoUrl: null,
		}),
		row({
			id: 3,
			status: "archived",
			name: "Alfombrilla",
			variantCount: 1,
			priceFrom: 900,
			priceTo: 900,
		}),
	]);

	test("a row per product: its name linking to its page, brand and category", () => {
		for (const id of [1, 2, 3])
			expect(html).toContain(`href="/admin/products/${id}"`);
		expect(html).toContain("Teclado Akko");
		expect(html).toContain("Ratón Pulsar");
		expect(html).toContain("Marca Dos");
		expect(html).toContain("Accesorios");
	});

	test("shows the price range and the variants of each, or that it has none", () => {
		expect(html).toContain("$15.00 - $25.00");
		expect(html).toContain(m.admin_product_sizes_n({ count: 2 }));
		expect(html).toContain("$9.00");
		expect(html).not.toContain("$9.00 -");
		expect(html).toContain(m.admin_product_sizes_n({ count: 1 }));
		expect(html).toContain(m.admin_no_price());
		expect(html).toContain(m.admin_product_sizes_n({ count: 0 }));
	});

	test("shows the status of each and the sellable units", () => {
		for (const status of [
			m.admin_product_status_draft(),
			m.admin_product_status_published(),
			m.admin_product_status_archived(),
		])
			expect(html).toContain(status);
		expect(html).toContain(">52<");
		expect(html).toContain(">0<");
	});

	test("shows the first photo, or the place where it will be", () => {
		expect(html.match(/<img /g)).toHaveLength(2);
		expect(html).toContain('src="/media/a.jpg"');
	});

	test("has a tab per status with all first, the filters and the way to create", () => {
		const tabs = [
			m.admin_product_all(),
			m.admin_product_status_draft(),
			m.admin_product_status_published(),
			m.admin_product_status_archived(),
		].map((label) => html.indexOf(`>${label}<`));
		expect(tabs.every((at) => at > 0)).toBe(true);
		expect([...tabs].sort((a, b) => a - b)).toEqual(tabs);
		for (const label of [
			m.admin_product_col_brand(),
			m.admin_product_col_category(),
		])
			expect(html).toContain(`aria-label="${label}"`);
		expect(html).toContain("Marca Uno");
		expect(html).toContain("Teclados");
		expect(html).toContain('href="/admin/products/new"');
		expect(html).toContain(m.admin_product_search());
	});

	test("marks the column the list is sorted by", () => {
		expect(html).toContain('aria-sort="descending"');
		expect(html.match(/aria-sort="descending"/g)).toHaveLength(1);
		const byName = table([row({})], { sort: "name", dir: "asc" });
		expect(byName).toContain('aria-sort="ascending"');
	});

	test("a list with no products invites to create the first", () => {
		const empty = table([]);
		expect(empty).toContain(m.admin_product_empty());
		expect(empty).toContain(m.admin_product_empty_hint());
		expect(empty).toContain('href="/admin/products/new"');
		expect(empty).not.toContain(m.admin_table_no_results_hint());
	});

	test("a filtered list with no products says nothing matches and offers to clear", () => {
		const none = table([], { q: "nothing" });
		expect(none).toContain(m.admin_table_no_results_hint());
		expect(none).not.toContain(m.admin_product_empty());
		expect(none).toContain(m.admin_table_clear_filters());
	});
});
