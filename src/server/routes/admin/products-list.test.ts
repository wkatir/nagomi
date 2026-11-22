import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";
import { searchKey } from "../../domain/search";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { productsRouter } = await import("./products");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/products", productsRouter);

type Row = {
	id: number;
	slug: string;
	status: string;
	createdAt: string;
	name: string;
	brand: string;
	category: string;
	variantCount: number;
	priceFrom: number | null;
	priceTo: number | null;
	stock: number;
	photoUrl: string | null;
};
type Page = {
	items: Row[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/products/list${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const ids = (page: Page) => page.items.map((p) => p.id);

let db: Database;

const orderItemOf = new Map<number, number>();
let receiptLines = 0;
function lot(variantId: number, units: number) {
	let item = orderItemOf.get(variantId);
	if (item === undefined) {
		item = orderItemOf.size + 1;
		orderItemOf.set(variantId, item);
		db.exec(
			`insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, ${variantId}, 1000, 700)`,
		);
	}
	db.exec(
		`insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, ${item}, ${units}, 0)`,
	);
	const line = ++receiptLines;
	db.exec(
		`insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (${variantId}, ${line}, 70000)`,
	);
	db.exec(
		`insert into inventory_movements (lot_id, kind, quantity, created_by) values (${line}, 'receive', ${units}, 'u')`,
	);
}

let orderCount = 0;
function order(
	status: "pending" | "cancelled",
	createdAt: string | null,
	lines: [number, number][],
) {
	const id = ++orderCount;
	db.exec(
		`insert into orders (id, code, idempotency_key, request_hash, locale, channel, status, subtotal, total, search_key${createdAt ? ", created_at" : ""}) values (${id}, 'ECL-${id}', 'k${id}', 'h', 'es', 'whatsapp', 'pending', 100, 100, 'ecl-${id}'${createdAt ? `, '${createdAt}'` : ""})`,
	);
	for (const [variantId, quantity] of lines)
		db.exec(
			`insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (${id}, ${variantId}, ${quantity}, 100, 'X', 'B', 'P')`,
		);
	if (status === "cancelled")
		db.exec(
			`update orders set status = 'cancelled', cancelled_at = '2026-01-01T00:00:00Z', cancel_reason = 'test' where id = ${id}`,
		);
}

const KEY_A = `${"a".repeat(64)}.jpg`;
const KEY_B = `${"b".repeat(64)}.jpg`;
const KEY_C = `${"c".repeat(64)}.jpg`;

beforeEach(() => {
	orderItemOf.clear();
	receiptLines = 0;
	orderCount = 0;
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 5);
insert into brands (slug, name, search_key) values ('beta', 'Beta', '${searchKey("Beta", "beta")}');
insert into brands (slug, name, search_key) values ('alfa', 'Alfa', '${searchKey("Alfa", "alfa")}');
insert into categories (slug, icon, sort_order) values ('cleanser', 'package', 1);
insert into categories (slug, icon, sort_order) values ('toner', 'package', 2);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Limpiador');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');

-- 1 oil: Beta, cleanser, published, two variants and an archived one.
insert into products (slug, brand_id, category_id, created_at) values ('oil', 1, 1, '2026-01-01T00:00:00Z');
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-001', 1500, '${searchKey("OIL-001", null)}');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-002', 2500, '${searchKey("OIL-002", null)}');
insert into variants (product_id, sku, price, status, search_key) values (1, 'OIL-003', 100, 'archived', '${searchKey("OIL-003", null)}');
-- 2 cream: Alfa, toner (no text of its own), a draft with one size at the same price.
insert into products (slug, brand_id, category_id, created_at) values ('cream', 2, 2, '2026-01-02T00:00:00Z');
insert into product_translations (product_id, locale, name, search_key) values (2, 'es', 'Crema', 'crema');
insert into variants (product_id, sku, price, search_key) values (2, 'CRM-001', 1500, '${searchKey("CRM-001", null)}');
-- 3 keyboard: Beta, cleanser, archived, no variants at all.
insert into products (slug, brand_id, category_id, created_at) values ('keyboard', 1, 1, '2026-01-02T00:00:00Z');
insert into product_translations (product_id, locale, name, search_key) values (3, 'es', 'Suero', 'suero');
-- 4 toner: Alfa, toner, published, no text in the default language.
insert into products (slug, brand_id, category_id, created_at) values ('toner', 2, 2, '2026-01-03T00:00:00Z');
insert into variants (product_id, sku, price, gtin, search_key) values (4, 'TON-001', 1200, '00012345678905', '${searchKey("TON-001", "00012345678905")}');
update products set status = 'published' where id in (1, 4);
update products set status = 'archived' where id = 3;

insert into media_files (r2_key, content_type, byte_size, width, height) values ('${KEY_A}', 'image/jpeg', 10, 4, 3), ('${KEY_B}', 'image/jpeg', 10, 4, 3), ('${KEY_C}', 'image/jpeg', 10, 4, 3);
-- Oil's photos: the first by position is B; the archived one at position 0 does not count.
insert into product_images (product_id, media_file_id, kind, position) values (1, 1, 'packshot', 2);
insert into product_images (product_id, media_file_id, kind, position) values (1, 2, 'detail', 1);
insert into product_images (product_id, media_file_id, kind, position, status) values (1, 3, 'lifestyle', 0, 'archived');
`);
	// OIL-001: 50 units, 8 held by a pending order. OIL-002: 15 units in two lots. The archived
	// variant's 100 units do not count.
	lot(1, 50);
	lot(2, 10);
	lot(2, 5);
	lot(3, 100);
	// TON-001 (variant 5): 20 units, 30 promised: never below zero.
	lot(5, 20);
	env.DB = d1(db);
	order("pending", null, [
		[1, 8],
		[5, 30],
	]);
	// Held only while recent (pending past its deadline) or confirmed; cancelled hold none.
	order("pending", "2020-01-01T00:00:00Z", [[2, 100]]);
	order("cancelled", null, [[2, 100]]);
});

describe("GET /products/list", () => {
	test("one row per product, newest first, a product without variants included", async () => {
		const page = await list();
		expect(ids(page)).toEqual([4, 3, 2, 1]);
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const [toner, keyboard, cream, oil] = page.items;
		expect(oil).toEqual({
			id: 1,
			slug: "oil",
			status: "published",
			createdAt: "2026-01-01T00:00:00Z",
			name: "Aceite",
			brand: "Beta",
			category: "Limpiador",
			// The archived variant is not counted, nor its price.
			variantCount: 2,
			priceFrom: 1500,
			priceTo: 2500,
			// 50 - 8 held, and 15: the archived variant, an order past its deadline and a
			// cancelled one add or take nothing.
			stock: 57,
			photoUrl: `/media/${KEY_B}`,
		});
		expect(cream).toMatchObject({
			name: "Crema",
			brand: "Alfa",
			// A category without text in the default language shows its slug.
			category: "toner",
			variantCount: 1,
			priceFrom: 1500,
			priceTo: 1500,
			stock: 0,
			photoUrl: null,
		});
		expect(keyboard).toMatchObject({
			status: "archived",
			variantCount: 0,
			priceFrom: null,
			priceTo: null,
			stock: 0,
		});
		// Without a name in the default language, the slug stands in.
		expect(toner).toMatchObject({ name: "toner", priceFrom: 1200, stock: 0 });
		expect(Object.keys(oil).sort()).toEqual(
			[
				"brand",
				"category",
				"createdAt",
				"id",
				"name",
				"photoUrl",
				"priceFrom",
				"priceTo",
				"variantCount",
				"slug",
				"status",
				"stock",
			].sort(),
		);
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			ids(await list(`sort=${sort}&dir=${dir}`));
		// Names: Aceite, Crema, Suero, and the slug "toner".
		expect(await sorted("name", "asc")).toEqual([1, 2, 3, 4]);
		expect(await sorted("name", "desc")).toEqual([4, 3, 2, 1]);
		// Two products of each brand.
		expect(await sorted("brand", "asc")).toEqual([2, 4, 1, 3]);
		expect(await sorted("brand", "desc")).toEqual([3, 1, 4, 2]);
		expect(await sorted("status", "asc")).toEqual([3, 2, 1, 4]);
		expect(await sorted("status", "desc")).toEqual([4, 1, 2, 3]);
		// Cream and keyboard were created at the same instant.
		expect(await sorted("createdAt", "asc")).toEqual([1, 2, 3, 4]);
		expect(await sorted("createdAt", "desc")).toEqual([4, 3, 2, 1]);
		// Keyboard has no price, oil and cream start at the same one.
		expect(await sorted("priceFrom", "asc")).toEqual([3, 4, 1, 2]);
		expect(await sorted("priceFrom", "desc")).toEqual([2, 1, 4, 3]);
		// Only oil has units; the rest, one of them promised beyond its stock, have none.
		expect(await sorted("stock", "asc")).toEqual([2, 3, 4, 1]);
		expect(await sorted("stock", "desc")).toEqual([1, 4, 3, 2]);
	});

	test("takes the page size and page the screen asks for, and answers a page past the end empty", async () => {
		// Eight more drafts: 12 in all, so a page of 10 leaves 2 for the next.
		for (let n = 1; n <= 8; n++)
			db.exec(
				`insert into products (slug, brand_id, category_id, created_at) values ('extra-${n}', 1, 1, '2025-01-0${n}T00:00:00Z')`,
			);
		const first = await list("pageSize=10");
		expect(ids(first)).toEqual([4, 3, 2, 1, 12, 11, 10, 9, 8, 7]);
		expect(first).toMatchObject({ total: 12, pageSize: 10, pageCount: 2 });
		const second = await list("pageSize=10&page=2");
		expect(ids(second)).toEqual([6, 5]);
		expect(second).toMatchObject({ total: 12, page: 2, pageCount: 2 });
		const past = await list("pageSize=10&page=9");
		expect(past).toMatchObject({ items: [], total: 12, page: 9, pageCount: 2 });
		expect((await list("pageSize=50")).items).toHaveLength(12);
	});

	test("filters by status, brand and category, and the total follows", async () => {
		expect(ids(await list("status=published&sort=name&dir=asc"))).toEqual([
			1, 4,
		]);
		expect(ids(await list("status=draft"))).toEqual([2]);
		expect(ids(await list("status=archived"))).toEqual([3]);
		expect(ids(await list("brandId=1&sort=name&dir=asc"))).toEqual([1, 3]);
		expect(ids(await list("categoryId=2&sort=name&dir=asc"))).toEqual([2, 4]);
		const both = await list("brandId=1&status=published");
		expect(ids(both)).toEqual([1]);
		expect(both.total).toBe(1);
		const none = await list("brandId=2&status=archived");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
	});

	test("searches the name, the brand, the SKU or barcode of any variant and the slug", async () => {
		const found = async (q: string) =>
			ids(await list(`q=${encodeURIComponent(q)}&sort=name&dir=asc`));
		// Accents and case do not matter.
		expect(await found("ACEITE")).toEqual([1]);
		expect(await found("crema")).toEqual([2]);
		expect(await found("alfa")).toEqual([2, 4]);
		expect(await found("crm")).toEqual([2]);
		// The SKU of the archived variant finds its product too.
		expect(await found("oil-003")).toEqual([1]);
		expect(await found("12345678905")).toEqual([4]);
		// A product without a name is found by its slug.
		expect(await found("toner")).toEqual([4]);
		expect(await found("nothing like this")).toEqual([]);
		expect(ids(await list("q=alfa&status=draft"))).toEqual([2]);
		expect((await list("q=alfa")).total).toBe(2);
	});

	test("refuses an unknown sort, a page size it does not offer and a bad filter", async () => {
		for (const query of [
			"sort=password",
			"sort=sizes",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"status=lost",
			"brandId=0",
			"categoryId=x",
			"q=",
		]) {
			const res = await app.request(`/products/list?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /products (one row per variant)", () => {
	test("keeps answering a row per variant with its stock, and still filters", async () => {
		type Variant = { variantId: number; sku: string; available: number };
		const get = async (query = "") => {
			const res = await app.request(`/products${query ? `?${query}` : ""}`);
			expect(res.status).toBe(200);
			return (await res.json()) as Variant[];
		};
		const all = await get();
		// By brand name, then product slug, then size: keyboard has no size and is not there.
		expect(all.map((v) => v.sku)).toEqual([
			"CRM-001",
			"TON-001",
			"OIL-001",
			"OIL-002",
			"OIL-003",
		]);
		expect(all.find((v) => v.sku === "OIL-001")?.available).toBe(42);
		expect((await get("status=draft")).map((v) => v.sku)).toEqual(["CRM-001"]);
		expect((await get("q=aceite")).map((v) => v.sku)).toEqual([
			"OIL-001",
			"OIL-002",
			"OIL-003",
		]);
		expect((await get("categoryId=2&brandId=2")).map((v) => v.sku)).toEqual([
			"CRM-001",
			"TON-001",
		]);
	});
});
