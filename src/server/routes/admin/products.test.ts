import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { productsRouter } = await import("./products");
const { categoriesRouter } = await import("./categories");

let actor = "admin-1";
const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", actor);
		c.set("staffRole", "admin");
		await next();
	})
	.route("/products", productsRouter)
	.route("/categories", categoriesRouter);

const send = (method: string, path: string, body: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
const json = async (res: Response): Promise<Record<string, unknown>> =>
	(await res.json()) as Record<string, unknown>;

let db: Database;
beforeEach(() => {
	actor = "admin-1";
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Nagomi', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5);
insert into users (id, name, email, role) values ('admin-1', 'Ana', 'ana@example.com', 'admin'), ('admin-2', 'Beto', 'beto@example.com', 'admin');
insert into brands (slug, name, search_key) values ('akko', 'Akko', 'akko');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1);
insert into products (slug, brand_id, category_id) values ('sakura-65', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado Sakura 65%', 'teclado sakura 65%');
`);
	env.DB = d1(db);
});

describe("PATCH /products/:id", () => {
	test("sets the warranty, the featured flag and the badge", async () => {
		const res = await send("PATCH", "/products/1", {
			warrantyMonths: 12,
			isFeatured: true,
			badge: "best_seller",
		});
		expect(res.status).toBe(200);
		expect(await json(res)).toMatchObject({
			warrantyMonths: 12,
			isFeatured: true,
			badge: "best_seller",
		});
	});

	test("refuses a negative warranty and an unknown badge", async () => {
		expect(
			(await send("PATCH", "/products/1", { warrantyMonths: -1 })).status,
		).toBe(400);
		expect((await send("PATCH", "/products/1", { badge: "hot" })).status).toBe(
			400,
		);
	});
});

describe("PUT /products/:id/specs", () => {
	const specs = [
		{
			translations: {
				es: { label: "Formato", value: "65%" },
				en: { label: "Layout", value: "65%" },
			},
		},
		{ translations: { es: { label: "Switches", value: "Hot-swap" } } },
	];

	test("replaces the whole list, in order, and the detail returns it", async () => {
		const res = await send("PUT", "/products/1/specs", { specs });
		expect(res.status).toBe(200);
		expect((await res.json()) as unknown).toEqual([
			{
				position: 1,
				translations: {
					es: { label: "Formato", value: "65%" },
					en: { label: "Layout", value: "65%" },
				},
			},
			{
				position: 2,
				translations: { es: { label: "Switches", value: "Hot-swap" } },
			},
		]);
		const again = await send("PUT", "/products/1/specs", {
			specs: [specs[1]],
		});
		expect(((await again.json()) as unknown[]).length).toBe(1);
		const detail = await json(await app.request("/products/1"));
		expect(detail.specs).toEqual([
			{
				position: 1,
				translations: { es: { label: "Switches", value: "Hot-swap" } },
			},
		]);
	});

	test("every row needs the store's language, and a blank value is refused", async () => {
		expect(
			(
				await send("PUT", "/products/1/specs", {
					specs: [{ translations: { en: { label: "Layout", value: "65%" } } }],
				})
			).status,
		).toBe(409);
		expect(
			(
				await send("PUT", "/products/1/specs", {
					specs: [{ translations: { es: { label: "Formato", value: " " } } }],
				})
			).status,
		).toBe(400);
	});
});

describe("variants", () => {
	test("a SKU is three capitals, a dash and three digits; it is upper-cased first", async () => {
		const created = await send("POST", "/products/1/variants", {
			sku: "tec-002",
			price: 7499,
		});
		expect(created.status).toBe(201);
		expect(await json(created)).toMatchObject({ sku: "TEC-002" });
		for (const sku of ["TEC-02", "TECL-002", "TEC_002", "002-TEC"])
			expect(
				(await send("POST", "/products/1/variants", { sku, price: 100 }))
					.status,
			).toBe(400);
	});

	test("every price a variant takes is in the price history, with the admin who set it", async () => {
		await send("POST", "/products/1/variants", { sku: "TEC-002", price: 7499 });
		actor = "admin-2";
		expect(
			(await send("PATCH", "/products/variants/1", { price: 6999 })).status,
		).toBe(200);
		expect(
			(await send("PATCH", "/products/variants/1", { optionLabel: "Rosa" }))
				.status,
		).toBe(200);
		const res = await app.request("/products/1/price-history");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject([
			{
				sku: "TEC-002",
				oldPrice: 7499,
				newPrice: 6999,
				changedBy: "admin-2",
				changedByName: "Beto",
			},
			{
				sku: "TEC-002",
				oldPrice: null,
				newPrice: 7499,
				changedBy: "admin-1",
				changedByName: "Ana",
			},
		]);
		expect((await app.request("/products/9/price-history")).status).toBe(404);
	});
});

describe("categories", () => {
	const category = (icon: string) =>
		send("POST", "/categories", {
			slug: "ratones",
			icon,
			sortOrder: 2,
			translations: {
				es: { name: "Ratones", subtitle: "Precisión y estilo" },
				en: { name: "Mice", subtitle: "Precision and style" },
			},
		});

	test("take an icon of the allow-list, a position and a translated subtitle", async () => {
		const res = await category("mouse");
		expect(res.status).toBe(201);
		expect(await json(res)).toMatchObject({
			slug: "ratones",
			icon: "mouse",
			sortOrder: 2,
			translations: expect.arrayContaining([
				expect.objectContaining({
					locale: "es",
					subtitle: "Precisión y estilo",
				}),
			]),
		});
	});

	test("refuse an icon outside the allow-list", async () => {
		expect((await category("armchair")).status).toBe(400);
	});
});
