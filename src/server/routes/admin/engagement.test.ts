import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { reviewsRouter } = await import("./engagement");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/reviews", reviewsRouter);

beforeEach(() => {
	const db = migratedDatabase();
	const triggers = db
		.query("select name from sqlite_master where type = 'trigger'")
		.all() as { name: string }[];
	for (const { name } of triggers) db.exec(`drop trigger "${name}"`);
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold, frequent_customer_min_orders, inactive_customer_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5, 3, 90);
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon) values ('teclados', 'keyboard');
insert into products (slug, brand_id, category_id) values ('rk75', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado RK75', 'teclado rk75');
insert into customers (id, name, email, search_key) values (1, 'Ana Pérez', 'ana@example.com', 'ana perez');
insert into product_reviews (product_id, customer_id, rating, title, body) values (1, 1, 4, 'Bueno', 'Me gusta');
`);
	env.DB = d1(db);
});

describe("GET /reviews", () => {
	test("names the product and the customer apart, though both columns are called name", async () => {
		const res = await app.request("/reviews?status=pending");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			reviews: Record<string, unknown>[];
			counts: Record<string, number>;
		};
		expect(body.reviews).toMatchObject([
			{
				productName: "Teclado RK75",
				customerId: 1,
				customerName: "Ana Pérez",
				customerEmail: "ana@example.com",
				rating: 4,
			},
		]);
		expect(body.counts).toEqual({ pending: 1, approved: 0, rejected: 0 });
	});
});
