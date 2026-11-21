import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { routinesRouter } = await import("./routines");
const { collectionsRouter } = await import("./collections");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/routines", routinesRouter)
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
insert into categories (slug, routine_step) values ('serum', 1);
insert into concerns (slug, position, status) values ('acne', 0, 'active'), ('dryness', 1, 'archived');
insert into products (slug, brand_id, category_id) values ('p1', 1, 1), ('p2', 1, 1), ('p3', 1, 1), ('p4', 1, 1);
insert into variants (product_id, sku, price, search_key) values (1, 'SKU1', 1000, 'sku1'), (2, 'SKU2', 1000, 'sku2'), (3, 'SKU3', 1000, 'sku3');
update variants set status = 'archived' where id = 3;
update products set status = 'archived' where id = 4;
insert into media_files (r2_key, content_type, byte_size, width, height) values ('${cover}', 'image/webp', 1, 1, 1);

insert into routines (slug, status, is_featured, position) values ('morning', 'published', 1, 2), ('night', 'draft', 0, 1), ('summer', 'archived', 0, 3), ('minimal', 'draft', 0, 2);
insert into routine_translations (routine_id, locale, title) values (1, 'es', 'Rutina de mañana'), (1, 'en', 'Morning routine'), (2, 'es', 'Rutina de noche'), (3, 'en', 'Summer routine'), (4, 'es', 'Ágil');
insert into routine_items (routine_id, variant_id, position) values (1, 1, 1), (1, 2, 2), (3, 1, 1), (4, 1, 1);

insert into collections (slug, status, position, show_on_home, cover_media_id) values ('essentials', 'published', 2, 1, 1), ('new', 'draft', 1, 0, null), ('old', 'archived', 3, 0, null), ('best-sellers', 'draft', 2, 1, null);
insert into collection_translations (collection_id, locale, title) values (1, 'es', 'Los esenciales'), (1, 'en', 'Essentials'), (2, 'es', 'Novedades'), (3, 'en', 'Old ones'), (4, 'es', 'Éxitos de ventas');
insert into collection_products (collection_id, product_id, position) values (1, 1, 1), (1, 2, 2), (3, 1, 1), (4, 2, 1);
`);
	env.DB = d1(db);
});

describe("GET /routines", () => {
	type Routine = {
		id: number;
		slug: string;
		title: string | null;
		status: string;
		isFeatured: boolean;
		position: number;
		steps: number;
	};

	test("is a page in the order the store shows, with the title in the default language and the steps", async () => {
		const page = await list<Routine>("routines");
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		expect(page.items).toEqual([
			{
				id: 2,
				slug: "night",
				title: "Rutina de noche",
				status: "draft",
				isFeatured: false,
				position: 1,
				steps: 0,
			},
			{
				id: 1,
				slug: "morning",
				title: "Rutina de mañana",
				status: "published",
				isFeatured: true,
				position: 2,
				steps: 2,
			},
			{
				id: 4,
				slug: "minimal",
				title: "Ágil",
				status: "draft",
				isFeatured: false,
				position: 2,
				steps: 1,
			},
			{
				id: 3,
				slug: "summer",
				title: null,
				status: "archived",
				isFeatured: false,
				position: 3,
				steps: 1,
			},
		]);
	});

	test.each([
		// No title first, then "Ágil" with the A's.
		["title", "asc", [3, 4, 1, 2]],
		["title", "desc", [2, 1, 4, 3]],
		["position", "asc", [2, 1, 4, 3]],
		["position", "desc", [3, 4, 1, 2]],
		["steps", "asc", [2, 3, 4, 1]],
		["steps", "desc", [1, 4, 3, 2]],
		["featured", "asc", [2, 3, 4, 1]],
		["featured", "desc", [1, 4, 3, 2]],
		["status", "asc", [3, 2, 4, 1]],
		["status", "desc", [1, 4, 2, 3]],
	])("sorts by %s %s", async (sort, dir, expected) => {
		expect(
			ids(await list<Routine>("routines", `sort=${sort}&dir=${dir}`)),
		).toEqual(expected);
	});

	test.each([
		["draft", [2, 4]],
		["published", [1]],
		["archived", [3]],
	])("narrows to the %s ones and reports the total", async (status, expected) => {
		const page = await list<Routine>("routines", `status=${status}`);
		expect(ids(page)).toEqual(expected);
		expect(page.total).toBe(expected.length);
	});

	test("searches the title in the default language and the slug without accents or case", async () => {
		expect(ids(await list<Routine>("routines", "q=noche"))).toEqual([2]);
		expect(ids(await list<Routine>("routines", "q=MA%C3%91ANA"))).toEqual([1]);
		expect(ids(await list<Routine>("routines", "q=manana"))).toEqual([1]);
		expect(ids(await list<Routine>("routines", "q=agil"))).toEqual([4]);
		expect(ids(await list<Routine>("routines", "q=%C3%81GIL"))).toEqual([4]);
		// The English title is not searched, but the slug is.
		expect(ids(await list<Routine>("routines", "q=summer"))).toEqual([3]);
		expect(ids(await list<Routine>("routines", "q=morning"))).toEqual([1]);
		const both = await list<Routine>("routines", "q=rutina&status=draft");
		expect(ids(both)).toEqual([2]);
		expect(both.total).toBe(1);
		expect(await list<Routine>("routines", "q=zzz")).toMatchObject({
			items: [],
			total: 0,
			pageCount: 1,
		});
	});

	test.each([
		"sort=slug",
		"status=active",
		"pageSize=30",
	])("refuses the query %s", async (query) => {
		expect((await app.request(`/routines?${query}`)).status).toBe(400);
	});
});

describe("GET /routines/options", () => {
	test("is the routines titled in the default language, with their status", async () => {
		expect(await get<Option[]>("routines/options")).toEqual([
			{ id: 4, name: "Ágil", status: "draft" },
			{ id: 1, name: "Rutina de mañana", status: "published" },
			{ id: 2, name: "Rutina de noche", status: "draft" },
		]);
	});
});

describe("routine steps", () => {
	type Detail = { items: { variantId: number; position: number }[] };
	const steps = (id: number) =>
		db
			.query(
				`select variant_id as variantId from routine_items where routine_id = ${id} order by position`,
			)
			.all()
			.map((row) => (row as { variantId: number }).variantId);

	test("are replaced in the order given", async () => {
		const res = await send("PUT", "/routines/2/items", { variantIds: [2, 1] });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Detail;
		expect(body.items.map((i) => [i.variantId, i.position])).toEqual([
			[2, 1],
			[1, 2],
		]);
		expect(steps(2)).toEqual([2, 1]);
	});

	test("move up and down by sending the list in the new order", async () => {
		const res = await send("PUT", "/routines/1/items", { variantIds: [2, 1] });
		expect(res.status).toBe(200);
		expect(steps(1)).toEqual([2, 1]);
		await send("PUT", "/routines/1/items", { variantIds: [1, 2] });
		expect(steps(1)).toEqual([1, 2]);
	});

	test("can be emptied while the routine is a draft", async () => {
		const res = await send("PUT", "/routines/4/items", { variantIds: [] });
		expect(res.status).toBe(200);
		expect(steps(4)).toEqual([]);
	});

	test("keep at least one while the routine is published", async () => {
		const res = await send("PUT", "/routines/1/items", { variantIds: [] });
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "routine_requires_items",
		});
		expect(steps(1)).toEqual([1, 2]);
	});

	test("refuse a size that is archived or does not exist, and change nothing", async () => {
		for (const variantIds of [[1, 3], [99]]) {
			const res = await send("PUT", "/routines/1/items", { variantIds });
			expect(await refusal(res)).toEqual({
				status: 409,
				error: "variant_unavailable",
			});
		}
		expect(steps(1)).toEqual([1, 2]);
	});

	test("refuse a size twice and more than twelve", async () => {
		expect(
			(await send("PUT", "/routines/2/items", { variantIds: [1, 1] })).status,
		).toBe(400);
		const thirteen = Array.from({ length: 13 }, (_, n) => n + 1);
		expect(
			(await send("PUT", "/routines/2/items", { variantIds: thirteen })).status,
		).toBe(400);
	});

	test("belong to a routine that exists", async () => {
		const res = await send("PUT", "/routines/99/items", { variantIds: [1] });
		expect(await refusal(res)).toEqual({ status: 404, error: "not_found" });
	});
});

describe("PATCH /routines/:id", () => {
	const status = (id: number) =>
		(
			db.query(`select status from routines where id = ${id}`).get() as {
				status: string;
			}
		).status;

	test("publishes a draft that has its title and a step", async () => {
		await send("PUT", "/routines/2/items", { variantIds: [1] });
		const res = await send("PATCH", "/routines/2", { status: "published" });
		expect(res.status).toBe(200);
		expect(status(2)).toBe("published");
	});

	test("refuses to publish a draft without steps", async () => {
		const res = await send("PATCH", "/routines/2", { status: "published" });
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "routine_requires_items",
		});
		expect(status(2)).toBe("draft");
	});

	test("refuses to publish a draft without its title in the default language", async () => {
		db.exec(
			"update routine_translations set locale = 'en' where routine_id = 4",
		);
		const res = await send("PATCH", "/routines/4", { status: "published" });
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "publish_requires_default_translation",
		});
	});

	test("takes a published routine back to draft", async () => {
		expect(
			(await send("PATCH", "/routines/1", { status: "draft" })).status,
		).toBe(200);
		expect(status(1)).toBe("draft");
	});

	test("archives a routine and restores it as a draft, but never publishes it straight away", async () => {
		expect(
			(await send("PATCH", "/routines/1", { status: "archived" })).status,
		).toBe(200);
		const direct = await send("PATCH", "/routines/1", { status: "published" });
		expect(await refusal(direct)).toEqual({
			status: 409,
			error: "invalid_transition",
		});
		expect(
			(await send("PATCH", "/routines/1", { status: "draft" })).status,
		).toBe(200);
		expect(status(1)).toBe("draft");
	});

	test("locks the slug of a published routine but not of a draft", async () => {
		const locked = await send("PATCH", "/routines/1", { slug: "evening" });
		expect(await refusal(locked)).toEqual({
			status: 409,
			error: "slug_locked",
		});
		const draft = await send("PATCH", "/routines/2", { slug: "evening" });
		expect(draft.status).toBe(200);
		expect(await draft.json()).toMatchObject({ id: 2, slug: "evening" });
		const taken = await send("PATCH", "/routines/4", { slug: "evening" });
		expect(await refusal(taken)).toEqual({
			status: 409,
			error: "duplicate_slug",
		});
	});

	test("features a routine", async () => {
		const res = await send("PATCH", "/routines/2", { isFeatured: true });
		expect(await res.json()).toMatchObject({ id: 2, isFeatured: true });
	});

	test("sets the need a routine answers, and clears it", async () => {
		const set = await send("PATCH", "/routines/2", { concernId: 1 });
		expect(await set.json()).toMatchObject({ id: 2, concernId: 1 });
		const cleared = await send("PATCH", "/routines/2", { concernId: null });
		expect(await cleared.json()).toMatchObject({ id: 2, concernId: null });
	});

	test("refuses a need that does not exist or is archived", async () => {
		const missing = await send("PATCH", "/routines/2", { concernId: 99 });
		expect(await refusal(missing)).toEqual({
			status: 409,
			error: "reference_unavailable",
		});
		const archived = await send("PATCH", "/routines/2", { concernId: 2 });
		expect(await refusal(archived)).toEqual({
			status: 409,
			error: "reference_unavailable",
		});
		expect(
			db.query("select concern_id from routines where id = 2").get(),
		).toEqual({ concern_id: null });
	});

	test("a published routine can change its need without touching its address", async () => {
		const res = await send("PATCH", "/routines/1", { concernId: 1 });
		expect(await res.json()).toMatchObject({
			id: 1,
			slug: "morning",
			concernId: 1,
		});
	});
});

describe("POST /routines", () => {
	const draft = (extra: object) => ({
		slug: "weekend",
		translations: { es: { title: "Fin de semana", description: null } },
		...extra,
	});

	test("starts without a need by default", async () => {
		const res = await send("POST", "/routines", draft({}));
		expect(res.status).toBe(201);
		expect(await res.json()).toMatchObject({
			slug: "weekend",
			concernId: null,
		});
	});

	test("starts with the need it answers", async () => {
		const res = await send("POST", "/routines", draft({ concernId: 1 }));
		expect(res.status).toBe(201);
		expect(await res.json()).toMatchObject({ concernId: 1 });
	});

	test("refuses an archived need and creates nothing", async () => {
		const res = await send("POST", "/routines", draft({ concernId: 2 }));
		expect(await refusal(res)).toEqual({
			status: 409,
			error: "reference_unavailable",
		});
		expect(
			db
				.query("select count(*) as n from routines where slug = 'weekend'")
				.get(),
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
