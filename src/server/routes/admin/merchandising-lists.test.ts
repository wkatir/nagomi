import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { bundlesRouter } = await import("./bundles");
const { collectionsRouter } = await import("./collections");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/bundles", bundlesRouter)
	.route("/collections", collectionsRouter);

type Page<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const get = async <T>(path: string, query = ""): Promise<T> => {
	const res = await app.request(`/${path}${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as T;
};
const list = <T>(path: string, query = "") => get<Page<T>>(path, query);
const ids = (page: Page<{ id: number }>) => page.items.map((row) => row.id);
const send = (method: string, path: string, body: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
const refusal = async (res: Response) => ({
	status: res.status,
	error: ((await res.json()) as { error: string }).error,
});

type Option = { id: number; name: string; status: string };

let db: Database;
const cover = `${"a".repeat(64)}.webp`;

beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es');
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1);
insert into products (slug, brand_id, category_id) values ('p1', 1, 1), ('p2', 1, 1), ('p3', 1, 1), ('p4', 1, 1);
insert into variants (product_id, sku, price, search_key) values (1, 'SKU-001', 1000, 'sku1'), (2, 'SKU-002', 1000, 'sku2'), (3, 'SKU-003', 1000, 'sku3');
update variants set status = 'archived' where id = 3;
update products set status = 'published' where id in (1, 2);
update products set status = 'archived' where id = 4;
insert into media_files (r2_key, content_type, byte_size, width, height) values ('${cover}', 'image/webp', 1, 1, 1);

insert into bundles (slug, status, is_featured, position, price) values ('sakura', 'draft', 1, 2, 1500), ('oficina', 'draft', 0, 1, 1500), ('verano', 'archived', 0, 3, 1500), ('mini', 'draft', 0, 2, 1500);
insert into bundle_translations (bundle_id, locale, name) values (1, 'es', 'Set de diseño'), (1, 'en', 'Design set'), (2, 'es', 'Set de oficina'), (3, 'en', 'Summer set'), (4, 'es', 'Ágil');
insert into bundle_items (bundle_id, variant_id, position) values (1, 1, 1), (1, 2, 2), (3, 1, 1), (4, 1, 1);
update bundles set status = 'published' where id = 1;

insert into collections (slug, status, position, show_on_home, cover_media_id) values ('essentials', 'published', 2, 1, 1), ('new', 'draft', 1, 0, null), ('old', 'archived', 3, 0, null), ('best-sellers', 'draft', 2, 1, null);
insert into collection_translations (collection_id, locale, title) values (1, 'es', 'Los esenciales'), (1, 'en', 'Essentials'), (2, 'es', 'Novedades'), (3, 'en', 'Old ones'), (4, 'es', 'Éxitos de ventas');
insert into collection_products (collection_id, product_id, position) values (1, 1, 1), (1, 2, 2), (3, 1, 1), (4, 2, 1);
`);
	env.DB = d1(db);
});

describe("GET /bundles", () => {
	type Bundle = {
		id: number;
		slug: string;
		name: string | null;
		status: string;
		isFeatured: boolean;
		position: number;
		price: number;
		items: number;
	};

	test("is a page in the order the store shows, with the name in the default language, the price and the items", async () => {
		const page = await list<Bundle>("bundles");
		expect(page).toMatchObject({ total: 4, page: 1, pageSize: 25 });
		expect(page.items).toEqual([
			{
				id: 2,
				slug: "oficina",
				name: "Set de oficina",
				status: "draft",
				isFeatured: false,
				position: 1,
				price: 1500,
				items: 0,
			},
			{
				id: 1,
				slug: "sakura",
				name: "Set de diseño",
				status: "published",
				isFeatured: true,
				position: 2,
				price: 1500,
				items: 2,
			},
			{
				id: 4,
				slug: "mini",
				name: "Ágil",
				status: "draft",
				isFeatured: false,
				position: 2,
				price: 1500,
				items: 1,
			},
			{
				id: 3,
				slug: "verano",
				name: null,
				status: "archived",
				isFeatured: false,
				position: 3,
				price: 1500,
				items: 1,
			},
		]);
	});

	test("narrows to a status and searches the name without accents or case", async () => {
		expect(ids(await list<Bundle>("bundles", "status=draft"))).toEqual([2, 4]);
		expect(ids(await list<Bundle>("bundles", "q=DISE%C3%91O"))).toEqual([1]);
		expect(ids(await list<Bundle>("bundles", "q=agil"))).toEqual([4]);
		expect(ids(await list<Bundle>("bundles", "q=sakura"))).toEqual([1]);
	});

	test("the options are the bundles named in the default language", async () => {
		expect(await get<Option[]>("bundles/options")).toEqual([
			{ id: 4, name: "Ágil", status: "draft" },
			{ id: 1, name: "Set de diseño", status: "published" },
			{ id: 2, name: "Set de oficina", status: "draft" },
		]);
	});
});

describe("bundle items", () => {
	const items = (id: number) =>
		db
			.query(
				`select variant_id as variantId, quantity from bundle_items where bundle_id = ${id} order by position`,
			)
			.all();

	test("are replaced in the order given, with their quantities", async () => {
		const res = await send("PUT", "/bundles/2/items", {
			items: [
				{ variantId: 2, quantity: 1 },
				{ variantId: 1, quantity: 2 },
			],
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			itemsTotal: 3000,
			saving: 1500,
		});
		expect(items(2)).toEqual([
			{ variantId: 2, quantity: 1 },
			{ variantId: 1, quantity: 2 },
		]);
	});

	test("of a published bundle can change while the rule still holds", async () => {
		const res = await send("PUT", "/bundles/1/items", {
			items: [
				{ variantId: 2, quantity: 2 },
				{ variantId: 1, quantity: 1 },
			],
		});
		expect(res.status).toBe(200);
		expect(items(1)).toEqual([
			{ variantId: 2, quantity: 2 },
			{ variantId: 1, quantity: 1 },
		]);
	});

	test("are at least two distinct ones, all for sale", async () => {
		expect(
			await refusal(
				await send("PUT", "/bundles/2/items", {
					items: [{ variantId: 1, quantity: 1 }],
				}),
			),
		).toEqual({ status: 409, error: "bundle_requires_two_items" });
		expect(
			(
				await send("PUT", "/bundles/2/items", {
					items: [
						{ variantId: 1, quantity: 1 },
						{ variantId: 1, quantity: 2 },
					],
				})
			).status,
		).toBe(400);
		const unavailable = await send("PUT", "/bundles/2/items", {
			items: [
				{ variantId: 1, quantity: 1 },
				{ variantId: 3, quantity: 1 },
			],
		});
		expect((await unavailable.json()) as unknown).toEqual({
			error: "bundle_item_unavailable",
			variantIds: [3],
		});
		expect(items(2)).toEqual([]);
	});

	test("cost more together than the bundle", async () => {
		const res = await send("PUT", "/bundles/2/items", {
			items: [
				{ variantId: 1, quantity: 1 },
				{ variantId: 2, quantity: 1 },
			],
		});
		expect(res.status).toBe(200);
		const expensive = await send("PATCH", "/bundles/2", { price: 2000 });
		expect(expensive.status).toBe(409);
		expect((await expensive.json()) as unknown).toEqual({
			error: "bundle_price_not_below_items",
			price: 2000,
			itemsTotal: 2000,
		});
		expect((await send("PATCH", "/bundles/2", { price: 1999 })).status).toBe(
			200,
		);
	});

	test("belong to a bundle that exists", async () => {
		const res = await send("PUT", "/bundles/99/items", { items: [] });
		expect(res.status).toBe(404);
	});
});

describe("PATCH /bundles/:id", () => {
	test("publishes a bundle with two items, its text and a price below them", async () => {
		const single = await send("PATCH", "/bundles/4", { status: "published" });
		expect(await refusal(single)).toEqual({
			status: 409,
			error: "bundle_requires_two_items",
		});
		await send("PUT", "/bundles/4/items", {
			items: [
				{ variantId: 1, quantity: 1 },
				{ variantId: 2, quantity: 1 },
			],
		});
		const res = await send("PATCH", "/bundles/4", { status: "published" });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ status: "published" });
	});

	test("refuses to publish without the default language's text", async () => {
		db.exec(
			"insert into bundle_items (bundle_id, variant_id, position) values (3, 2, 2)",
		);
		db.exec("update bundles set status = 'draft' where id = 3");
		expect(
			await refusal(await send("PATCH", "/bundles/3", { status: "published" })),
		).toEqual({ status: 409, error: "publish_requires_default_translation" });
	});

	test("locks the slug of a published bundle but not of a draft", async () => {
		const locked = await send("PATCH", "/bundles/1", { slug: "otro" });
		expect(await refusal(locked)).toEqual({
			status: 409,
			error: "slug_locked",
		});
		expect((await send("PATCH", "/bundles/2", { slug: "otro" })).status).toBe(
			200,
		);
		const taken = await send("PATCH", "/bundles/4", { slug: "otro" });
		expect(await refusal(taken)).toEqual({
			status: 409,
			error: "duplicate_slug",
		});
	});

	test("archives a bundle and restores it as a draft, but never publishes it straight away", async () => {
		expect(
			(await send("PATCH", "/bundles/1", { status: "archived" })).status,
		).toBe(200);
		const direct = await send("PATCH", "/bundles/1", { status: "published" });
		expect(await refusal(direct)).toEqual({
			status: 409,
			error: "invalid_transition",
		});
		expect(
			(await send("PATCH", "/bundles/1", { status: "draft" })).status,
		).toBe(200);
	});
});

describe("POST /bundles", () => {
	test("creates a draft with its price, texts and items", async () => {
		const res = await send("POST", "/bundles", {
			slug: "streaming",
			price: 1800,
			translations: {
				es: { name: "Set Streaming" },
				en: { name: "Streaming Set" },
			},
			items: [
				{ variantId: 1, quantity: 1 },
				{ variantId: 2, quantity: 1 },
			],
		});
		expect(res.status).toBe(201);
		expect(await res.json()).toMatchObject({
			slug: "streaming",
			status: "draft",
			price: 1800,
			itemsTotal: 2000,
			saving: 200,
		});
	});

	test("refuses a price that is not below its items, and writes nothing", async () => {
		const res = await send("POST", "/bundles", {
			slug: "caro",
			price: 2500,
			translations: { es: { name: "Caro" } },
			items: [
				{ variantId: 1, quantity: 1 },
				{ variantId: 2, quantity: 1 },
			],
		});
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "bundle_price_not_below_items",
		});
		expect(
			db.query("select count(*) as n from bundles where slug = 'caro'").get(),
		).toEqual({ n: 0 });
	});
});

describe("GET /collections", () => {
	type Collection = {
		id: number;
		slug: string;
		title: string | null;
		status: string;
		position: number;
		showOnHome: boolean;
		products: number;
		cover: string | null;
	};

	test("is a page in the order the store shows, with title, products and cover", async () => {
		const page = await list<Collection>("collections");
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		expect(page.items).toEqual([
			{
				id: 2,
				slug: "new",
				title: "Novedades",
				status: "draft",
				position: 1,
				showOnHome: false,
				products: 0,
				cover: null,
			},
			{
				id: 1,
				slug: "essentials",
				title: "Los esenciales",
				status: "published",
				position: 2,
				showOnHome: true,
				products: 2,
				cover: `/media/${cover}`,
			},
			{
				id: 4,
				slug: "best-sellers",
				title: "Éxitos de ventas",
				status: "draft",
				position: 2,
				showOnHome: true,
				products: 1,
				cover: null,
			},
			{
				id: 3,
				slug: "old",
				title: null,
				status: "archived",
				position: 3,
				showOnHome: false,
				products: 1,
				cover: null,
			},
		]);
	});

	test.each([
		// No title first, then "Éxitos" with the E's.
		["title", "asc", [3, 4, 1, 2]],
		["title", "desc", [2, 1, 4, 3]],
		["position", "asc", [2, 1, 4, 3]],
		["position", "desc", [3, 4, 1, 2]],
		["products", "asc", [2, 3, 4, 1]],
		["products", "desc", [1, 4, 3, 2]],
		["home", "asc", [2, 3, 1, 4]],
		["home", "desc", [4, 1, 3, 2]],
		["status", "asc", [3, 2, 4, 1]],
		["status", "desc", [1, 4, 2, 3]],
	])("sorts by %s %s", async (sort, dir, expected) => {
		expect(
			ids(await list<Collection>("collections", `sort=${sort}&dir=${dir}`)),
		).toEqual(expected);
	});

	test.each([
		["draft", [2, 4]],
		["published", [1]],
		["archived", [3]],
	])("narrows to the %s ones and reports the total", async (status, expected) => {
		const page = await list<Collection>("collections", `status=${status}`);
		expect(ids(page)).toEqual(expected);
		expect(page.total).toBe(expected.length);
	});

	test("searches the title in the default language and the slug without accents or case", async () => {
		expect(ids(await list<Collection>("collections", "q=exitos"))).toEqual([4]);
		expect(ids(await list<Collection>("collections", "q=%C3%89XITOS"))).toEqual(
			[4],
		);
		expect(ids(await list<Collection>("collections", "q=ESENCIALES"))).toEqual([
			1,
		]);
		expect(ids(await list<Collection>("collections", "q=novedades"))).toEqual([
			2,
		]);
		// The English title is not searched, but the slug is.
		expect(ids(await list<Collection>("collections", "q=old"))).toEqual([3]);
		expect(ids(await list<Collection>("collections", "q=best"))).toEqual([4]);
		const both = await list<Collection>("collections", "q=e&status=draft");
		expect(ids(both)).toEqual([2, 4]);
		expect(both.total).toBe(2);
		expect(await list<Collection>("collections", "q=zzz")).toMatchObject({
			items: [],
			total: 0,
			pageCount: 1,
		});
	});

	test("refuses a sort that is not a column of the list", async () => {
		expect((await app.request("/collections?sort=showOnHome")).status).toBe(
			400,
		);
	});
});

describe("GET /collections/options", () => {
	test("is the collections titled in the default language, with their status", async () => {
		expect(await get<Option[]>("collections/options")).toEqual([
			{ id: 4, name: "Éxitos de ventas", status: "draft" },
			{ id: 1, name: "Los esenciales", status: "published" },
			{ id: 2, name: "Novedades", status: "draft" },
		]);
	});
});

describe("collection products", () => {
	type Detail = { products: { productId: number; position: number }[] };
	const members = (id: number) =>
		db
			.query(
				`select product_id as productId from collection_products where collection_id = ${id} order by position`,
			)
			.all()
			.map((row) => (row as { productId: number }).productId);

	test("are replaced in the order given", async () => {
		const res = await send("PUT", "/collections/2/products", {
			productIds: [2, 1],
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Detail;
		expect(body.products.map((p) => [p.productId, p.position])).toEqual([
			[2, 1],
			[1, 2],
		]);
		expect(members(2)).toEqual([2, 1]);
	});

	test("move up and down by sending the list in the new order", async () => {
		expect(
			(await send("PUT", "/collections/1/products", { productIds: [2, 1] }))
				.status,
		).toBe(200);
		expect(members(1)).toEqual([2, 1]);
		await send("PUT", "/collections/1/products", { productIds: [1, 2] });
		expect(members(1)).toEqual([1, 2]);
	});

	test("can be emptied while the collection is a draft", async () => {
		expect(
			(await send("PUT", "/collections/4/products", { productIds: [] })).status,
		).toBe(200);
		expect(members(4)).toEqual([]);
	});

	test("keep at least one while the collection is published", async () => {
		const res = await send("PUT", "/collections/1/products", {
			productIds: [],
		});
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "collection_requires_products",
		});
		expect(members(1)).toEqual([1, 2]);
	});

	test("refuse an archived product or one that does not exist, and change nothing", async () => {
		for (const productIds of [[1, 4], [99]]) {
			const res = await send("PUT", "/collections/1/products", { productIds });
			expect(await refusal(res)).toEqual({
				status: 409,
				error: "reference_unavailable",
			});
		}
		expect(members(1)).toEqual([1, 2]);
	});

	test("refuse a product twice", async () => {
		expect(
			(await send("PUT", "/collections/2/products", { productIds: [1, 1] }))
				.status,
		).toBe(400);
	});

	test("belong to a collection that exists", async () => {
		const res = await send("PUT", "/collections/99/products", {
			productIds: [1],
		});
		expect(await refusal(res)).toEqual({ status: 404, error: "not_found" });
	});
});

describe("PATCH /collections/:id", () => {
	const status = (id: number) =>
		(
			db.query(`select status from collections where id = ${id}`).get() as {
				status: string;
			}
		).status;

	test("publishes a draft that has its title and a product", async () => {
		const res = await send("PATCH", "/collections/4", { status: "published" });
		expect(res.status).toBe(200);
		expect(status(4)).toBe("published");
	});

	test("refuses to publish a draft without products", async () => {
		const res = await send("PATCH", "/collections/2", { status: "published" });
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "collection_requires_products",
		});
		expect(status(2)).toBe("draft");
	});

	test("refuses to publish a draft without its title in the default language", async () => {
		db.exec(
			"update collection_translations set locale = 'en' where collection_id = 4",
		);
		const res = await send("PATCH", "/collections/4", { status: "published" });
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "publish_requires_default_translation",
		});
	});

	test("archives a collection and restores it as a draft, but never publishes it straight away", async () => {
		expect(
			(await send("PATCH", "/collections/1", { status: "archived" })).status,
		).toBe(200);
		const direct = await send("PATCH", "/collections/1", {
			status: "published",
		});
		expect(await refusal(direct)).toEqual({
			status: 409,
			error: "invalid_transition",
		});
		expect(
			(await send("PATCH", "/collections/1", { status: "draft" })).status,
		).toBe(200);
		expect(status(1)).toBe("draft");
	});

	test("locks the slug of a published collection but not of a draft", async () => {
		const locked = await send("PATCH", "/collections/1", { slug: "basics" });
		expect(await refusal(locked)).toEqual({
			status: 409,
			error: "slug_locked",
		});
		const draft = await send("PATCH", "/collections/2", { slug: "basics" });
		expect(await draft.json()).toMatchObject({ id: 2, slug: "basics" });
	});

	test("shows a collection on the home page in a place, with its cover", async () => {
		const res = await send("PATCH", "/collections/2", {
			showOnHome: true,
			position: 5,
			coverMediaId: 1,
		});
		expect(await res.json()).toMatchObject({
			id: 2,
			showOnHome: true,
			position: 5,
			coverMediaId: 1,
		});
	});

	test("refuses a cover that is not in the library", async () => {
		const res = await send("PATCH", "/collections/2", { coverMediaId: 99 });
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "reference_unavailable",
		});
	});
});
