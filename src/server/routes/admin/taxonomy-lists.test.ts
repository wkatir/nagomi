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
const { brandsRouter } = await import("./brands");
const { categoriesRouter } = await import("./categories");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/brands", brandsRouter)
	.route("/categories", categoriesRouter);

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
const patch = (path: string, body: unknown) =>
	app.request(path, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

const put = (path: string, body: unknown) =>
	app.request(path, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

type Option = { id: number; name: string; status: string };

let db: Database;

// A published product needs a priced size first.
let productId = 0;
function product(o: {
	brand: number;
	category: number;
	status: "draft" | "published" | "archived";
}) {
	const id = ++productId;
	db.exec(
		`insert into products (id, slug, brand_id, category_id) values (${id}, 'p${id}', ${o.brand}, ${o.category})`,
	);
	if (o.status === "published") {
		db.exec(
			`insert into product_translations (product_id, locale, name, search_key) values (${id}, 'es', 'Producto ${id}', 'producto ${id}')`,
		);
		db.exec(
			`insert into variants (product_id, sku, price, search_key) values (${id}, 'SKU-00${id}', 1000, 'sku-00${id}')`,
		);
	}
	if (o.status !== "draft")
		db.exec(`update products set status = '${o.status}' where id = ${id}`);
}

beforeEach(() => {
	productId = 0;
	db = migratedDatabase();
	db.exec(
		"insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es')",
	);
	env.DB = d1(db);
	const brand = (
		slug: string,
		name: string,
		country: string | null,
		status = "active",
	) =>
		db
			.prepare(
				"insert into brands (slug, name, search_key, country_code, status) values (?, ?, ?, ?, ?)",
			)
			.run(slug, name, searchKey(name, slug), country, status);
	brand("cle-lab", "Clé Lab", "KR");
	brand("akko", "Akko", "KR");
	brand("logitech", "logitech", null);
	brand("elan-audio", "Élan Audio", "FR");
	brand("zeta", "Zeta", "KR", "archived");

	const category = (
		slug: string,
		step: number,
		names: [locale: string, name: string][],
		status = "active",
	) => {
		const { lastInsertRowid } = db
			.prepare(
				"insert into categories (slug, icon, sort_order, status) values (?, 'package', ?, ?)",
			)
			.run(slug, step, status);
		for (const [locale, name] of names)
			db.prepare(
				"insert into category_translations (category_id, locale, name) values (?, ?, ?)",
			).run(lastInsertRowid, locale, name);
	};
	category("keyboard", 2, [
		["es", "Teclado"],
		["en", "Keyboard"],
	]);
	category("mice", 1, [["es", "Ratones"]]);
	// Archived, named only in English: it has no name in the store's language.
	category("lighting", 5, [["en", "Lighting"]], "archived");
	category("optical", 2, [["es", "Ópticos"]]);

	// Brand 1 has a published and a draft product, brand 2 only an archived one, brand 3 a
	// draft. Category 1 has the published and the draft one, category 2 the archived one.
	product({ brand: 1, category: 1, status: "published" });
	product({ brand: 1, category: 1, status: "draft" });
	product({ brand: 2, category: 2, status: "archived" });
	product({ brand: 3, category: 4, status: "draft" });
});

describe("GET /brands", () => {
	type Brand = {
		id: number;
		slug: string;
		name: string;
		countryCode: string | null;
		status: string;
		products: number;
	};

	test("is a page of rows with their product counts, by name without accents or case", async () => {
		const page = await list<Brand>("brands");
		expect(page).toMatchObject({
			total: 5,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		// Binary order would put "Zeta" before "logitech" and "Élan Audio" last.
		expect(page.items).toEqual([
			{
				id: 2,
				slug: "akko",
				name: "Akko",
				countryCode: "KR",
				status: "active",
				products: 0,
			},
			{
				id: 1,
				slug: "cle-lab",
				name: "Clé Lab",
				countryCode: "KR",
				status: "active",
				products: 2,
			},
			{
				id: 4,
				slug: "elan-audio",
				name: "Élan Audio",
				countryCode: "FR",
				status: "active",
				products: 0,
			},
			{
				id: 3,
				slug: "logitech",
				name: "logitech",
				countryCode: null,
				status: "active",
				products: 1,
			},
			{
				id: 5,
				slug: "zeta",
				name: "Zeta",
				countryCode: "KR",
				status: "archived",
				products: 0,
			},
		]);
	});

	test.each([
		["name", "asc", [2, 1, 4, 3, 5]],
		["name", "desc", [5, 3, 4, 1, 2]],
		["country", "asc", [3, 4, 1, 2, 5]],
		["country", "desc", [5, 2, 1, 4, 3]],
		["products", "asc", [2, 4, 5, 3, 1]],
		["products", "desc", [1, 3, 5, 4, 2]],
		["status", "asc", [1, 2, 3, 4, 5]],
		["status", "desc", [5, 4, 3, 2, 1]],
	])("sorts by %s %s, equal values by id in the same direction", async (sort, dir, expected) => {
		expect(ids(await list<Brand>("brands", `sort=${sort}&dir=${dir}`))).toEqual(
			expected,
		);
	});

	test("narrows to a status and reports the total of what matches", async () => {
		const archived = await list<Brand>("brands", "status=archived");
		expect(ids(archived)).toEqual([5]);
		expect(archived.total).toBe(1);
		const active = await list<Brand>("brands", "status=active");
		expect(active.total).toBe(4);
		expect(ids(active)).toEqual([2, 1, 4, 3]);
	});

	test("searches the name and the slug without accents or case", async () => {
		expect(ids(await list<Brand>("brands", "q=cle"))).toEqual([1]);
		expect(ids(await list<Brand>("brands", "q=CLÉ"))).toEqual([1]);
		expect(ids(await list<Brand>("brands", "q=%C3%89LAN"))).toEqual([4]);
		expect(ids(await list<Brand>("brands", "q=elan"))).toEqual([4]);
		expect(ids(await list<Brand>("brands", "q=%20AKKO%20"))).toEqual([2]);
		expect(ids(await list<Brand>("brands", "q=lab"))).toEqual([1]);
		const none = await list<Brand>("brands", "q=zzz");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
	});

	test("combines the search with the status and counts only what matches both", async () => {
		const page = await list<Brand>("brands", "q=a&status=active");
		expect(ids(page)).toEqual([2, 1, 4]);
		expect(page.total).toBe(3);
	});

	test("pages the rows: the last page is partial, one past it is empty with the real total", async () => {
		for (let n = 1; n <= 25; n++)
			db.exec(
				`insert into brands (slug, name, search_key) values ('marca-${n}', 'Marca ${String(n).padStart(2, "0")}', 'marca ${n} marca-${n}')`,
			);
		const second = await list<Brand>("brands", "pageSize=10&page=2");
		expect(second).toMatchObject({
			total: 30,
			page: 2,
			pageSize: 10,
			pageCount: 3,
		});
		expect(second.items).toHaveLength(10);
		expect(second.items[0].name).toBe("Marca 07");
		const last = await list<Brand>("brands", "pageSize=10&page=3");
		expect(last.items.map((b) => b.name)).toEqual([
			"Marca 17",
			"Marca 18",
			"Marca 19",
			"Marca 20",
			"Marca 21",
			"Marca 22",
			"Marca 23",
			"Marca 24",
			"Marca 25",
			"Zeta",
		]);
		const past = await list<Brand>("brands", "pageSize=10&page=4");
		expect(past).toMatchObject({ items: [], total: 30, pageCount: 3 });
	});

	test.each([
		"sort=countryCode",
		"dir=up",
		"pageSize=7",
		"page=0",
		"status=draft",
	])("refuses the query %s", async (query) => {
		const res = await app.request(`/brands?${query}`);
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toBe(
			"invalid_request",
		);
	});
});

describe("GET /brands/options", () => {
	test("is every brand as id, name and status, by name without accents", async () => {
		expect(await get<Option[]>("brands/options")).toEqual([
			{ id: 2, name: "Akko", status: "active" },
			{ id: 1, name: "Clé Lab", status: "active" },
			{ id: 4, name: "Élan Audio", status: "active" },
			{ id: 3, name: "logitech", status: "active" },
			{ id: 5, name: "Zeta", status: "archived" },
		]);
	});
});

describe("PATCH /brands/:id", () => {
	const status = (id: number) =>
		(
			db.query(`select status from brands where id = ${id}`).get() as {
				status: string;
			}
		).status;

	test("refuses to archive a brand with a published product", async () => {
		const res = await patch("/brands/1", { status: "archived" });
		expect(res.status).toBe(409);
		expect(await res.text()).toBe(JSON.stringify({ error: "in_use" }));
		expect(status(1)).toBe("active");
	});

	test("archives a brand whose products are drafts, and restores it", async () => {
		const archive = await patch("/brands/3", { status: "archived" });
		expect(archive.status).toBe(200);
		expect(status(3)).toBe("archived");
		const restore = await patch("/brands/3", { status: "active" });
		expect(restore.status).toBe(200);
		expect(status(3)).toBe("active");
	});

	test("restores an archived brand", async () => {
		expect((await patch("/brands/5", { status: "active" })).status).toBe(200);
		expect(status(5)).toBe("active");
	});
});

describe("GET /categories", () => {
	type Category = {
		id: number;
		slug: string;
		name: string | null;
		sortOrder: number;
		icon: string;
		status: string;
		products: number;
	};

	test("is a page in the store's order, with the name in the default language", async () => {
		const page = await list<Category>("categories");
		expect(page).toMatchObject({
			total: 4,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		expect(page.items).toEqual([
			{
				id: 2,
				slug: "mice",
				name: "Ratones",
				sortOrder: 1,
				icon: "package",
				status: "active",
				// Its only product is archived.
				products: 0,
			},
			{
				id: 1,
				slug: "keyboard",
				name: "Teclado",
				sortOrder: 2,
				icon: "package",
				status: "active",
				products: 2,
			},
			{
				id: 4,
				slug: "optical",
				name: "Ópticos",
				sortOrder: 2,
				icon: "package",
				status: "active",
				products: 1,
			},
			{
				id: 3,
				slug: "lighting",
				name: null,
				sortOrder: 5,
				icon: "package",
				status: "archived",
				products: 0,
			},
		]);
	});

	test.each([
		// A category with no name sorts first; "Ópticos" sorts with the O's.
		["name", "asc", [3, 4, 2, 1]],
		["name", "desc", [1, 2, 4, 3]],
		["sortOrder", "asc", [2, 1, 4, 3]],
		["sortOrder", "desc", [3, 4, 1, 2]],
		["products", "asc", [2, 3, 4, 1]],
		["products", "desc", [1, 4, 3, 2]],
		["status", "asc", [1, 2, 4, 3]],
		["status", "desc", [3, 4, 2, 1]],
	])("sorts by %s %s", async (sort, dir, expected) => {
		expect(
			ids(await list<Category>("categories", `sort=${sort}&dir=${dir}`)),
		).toEqual(expected);
	});

	test("narrows to a status and reports the total of what matches", async () => {
		const archived = await list<Category>("categories", "status=archived");
		expect(ids(archived)).toEqual([3]);
		expect(archived.total).toBe(1);
		expect((await list<Category>("categories", "status=active")).total).toBe(3);
	});

	test("searches the name in the default language and the slug without accents or case", async () => {
		expect(ids(await list<Category>("categories", "q=opticos"))).toEqual([4]);
		expect(ids(await list<Category>("categories", "q=%C3%93PTICOS"))).toEqual([
			4,
		]);
		expect(ids(await list<Category>("categories", "q=keyboard"))).toEqual([1]);
		expect(ids(await list<Category>("categories", "q=TECLADO"))).toEqual([1]);
		// The English name is not searched, but the slug is.
		expect(ids(await list<Category>("categories", "q=lighting"))).toEqual([3]);
		expect(ids(await list<Category>("categories", "q=Rato"))).toEqual([2]);
		const none = await list<Category>("categories", "q=zzz");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
	});

	test("refuses a sort that is not a column of the list", async () => {
		expect((await app.request("/categories?sort=slug")).status).toBe(400);
	});
});

describe("GET /categories/options", () => {
	test("is the categories named in the default language, by name without accents", async () => {
		// The archived one without a Spanish name is left out.
		expect(await get<Option[]>("categories/options")).toEqual([
			{ id: 4, name: "Ópticos", status: "active" },
			{ id: 2, name: "Ratones", status: "active" },
			{ id: 1, name: "Teclado", status: "active" },
		]);
	});

	test("follows the store's default language", async () => {
		db.exec("update store_settings set default_locale = 'en'");
		expect(await get<Option[]>("categories/options")).toEqual([
			{ id: 1, name: "Keyboard", status: "active" },
			{ id: 3, name: "Lighting", status: "archived" },
		]);
	});
});

describe("PATCH /categories/:id", () => {
	test("refuses to archive a category with a published product", async () => {
		const res = await patch("/categories/1", { status: "archived" });
		expect(res.status).toBe(409);
		expect(await res.text()).toBe(JSON.stringify({ error: "in_use" }));
	});

	test("archives a category whose products are drafts, and restores it", async () => {
		expect((await patch("/categories/4", { status: "archived" })).status).toBe(
			200,
		);
		const restore = await patch("/categories/4", { status: "active" });
		expect(restore.status).toBe(200);
		expect(await restore.json()).toMatchObject({ id: 4, status: "active" });
	});
});

describe("PUT /categories/:id/translations/:locale", () => {
	test("stores the intro of the product type page", async () => {
		const res = await put("/categories/1/translations/es", {
			name: "Teclado",
			description: "Para escribir y jugar.",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			categoryId: 1,
			description: "Para escribir y jugar.",
		});
	});
});
