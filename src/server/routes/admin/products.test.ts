import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { productsRouter } = await import("./products");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/products", productsRouter);

const patch = (body: unknown) =>
	app.request("/products/1", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
const skinTypes = async (res: Response) =>
	((await res.json()) as { skinTypes: string[] }).skinTypes;

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 180);
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, routine_step) values ('cleanser', 1);
insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite');
`);
	env.DB = d1(db);
});

describe("PATCH /products/:id skin types", () => {
	test("replaces the whole set and reads it back in the standard order", async () => {
		const first = await patch({ skinTypes: ["sensitive", "oily"] });
		expect(first.status).toBe(200);
		expect(await skinTypes(first)).toEqual(["oily", "sensitive"]);
		expect(await skinTypes(await patch({ skinTypes: ["dry"] }))).toEqual([
			"dry",
		]);
		expect(await skinTypes(await patch({ skinTypes: [] }))).toEqual([]);
	});

	test("leaves the set alone when the patch does not name it", async () => {
		await patch({ skinTypes: ["oily"] });
		expect(await skinTypes(await patch({ inci: "Aqua" }))).toEqual(["oily"]);
	});

	test("refuses unknown and repeated skin types", async () => {
		expect((await patch({ skinTypes: ["shiny"] })).status).toBe(400);
		expect((await patch({ skinTypes: ["oily", "oily"] })).status).toBe(400);
	});
});
