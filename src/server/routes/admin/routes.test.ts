import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { shippingRouter } = await import("./shipping");
const { purchasingRouter } = await import("./purchasing");
const { categoriesRouter } = await import("./categories");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/shipping-zones", shippingRouter)
	.route("/purchase-orders", purchasingRouter)
	.route("/categories", categoriesRouter);

const send = (method: string, path: string, body: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	db.exec(
		"insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es')",
	);
	env.DB = d1(db);
});

describe("PATCH /shipping-zones/:id", () => {
	const archivedZone = (texts: [locale: string, name: string][]) => {
		db.exec(
			"insert into shipping_zones (slug, method, fee, delivery_days_min, delivery_days_max, status) values ('centro', 'own_delivery', 300, 1, 2, 'archived')",
		);
		for (const [locale, name] of texts)
			db.prepare(
				"insert into shipping_zone_translations (zone_id, locale, name) values (1, ?, ?)",
			).run(locale, name);
	};
	const zoneStatus = () =>
		(
			db.query("select status from shipping_zones where id = 1").get() as {
				status: string;
			}
		).status;

	test("refuses to restore a zone without its name in the default locale", async () => {
		archivedZone([["en", "Downtown"]]);
		const res = await send("PATCH", "/shipping-zones/1", { status: "active" });
		expect(res.status).toBe(409);
		expect(await res.text()).toBe(
			JSON.stringify({ error: "publish_requires_default_translation" }),
		);
		expect(zoneStatus()).toBe("archived");
	});

	test("still edits an archived zone without that name when it stays archived", async () => {
		archivedZone([]);
		const res = await send("PATCH", "/shipping-zones/1", { fee: 500 });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ fee: 500, status: "archived" });
	});

	test("restores a zone named in the default locale", async () => {
		archivedZone([["es", "Centro"]]);
		const res = await send("PATCH", "/shipping-zones/1", { status: "active" });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ id: 1, status: "active" });
		expect(zoneStatus()).toBe("active");
	});
});

describe.each([
	{
		path: "categories",
		insert:
			"insert into categories (slug, icon, sort_order, status) values ('keyboard', 'package', 1, 'archived')",
		text: "insert into category_translations (category_id, locale, name) values (1, ?, ?)",
	},
])("PATCH /$path/:id", ({ path, insert, text }) => {
	const archived = (texts: [locale: string, name: string][]) => {
		db.exec(insert);
		for (const [locale, name] of texts) db.prepare(text).run(locale, name);
	};
	const status = () =>
		(
			db.query(`select status from ${path} where id = 1`).get() as {
				status: string;
			}
		).status;

	test("refuses to restore one without its name in the default locale", async () => {
		archived([["en", "Name"]]);
		const res = await send("PATCH", `/${path}/1`, { status: "active" });
		expect(res.status).toBe(409);
		expect(await res.text()).toBe(
			JSON.stringify({ error: "publish_requires_default_translation" }),
		);
		expect(status()).toBe("archived");
	});

	test("restores one named in the default locale", async () => {
		archived([["es", "Nombre"]]);
		const res = await send("PATCH", `/${path}/1`, { status: "active" });
		expect(res.status).toBe(200);
		expect(status()).toBe("active");
	});
});

describe("POST /purchase-orders/:id/receive", () => {
	const receipt = {
		receivedOn: "2026-10-01",
		lots: [{ purchaseOrderItemId: 1, quantity: 1 }],
	};

	test("refuses a receipt without its shipping cost", async () => {
		const res = await send("POST", "/purchase-orders/1/receive", receipt);
		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			error: string;
			issues: { path: string }[];
		};
		expect(body.error).toBe("invalid_request");
		expect(body.issues.map((i) => i.path)).toEqual(["shippingCost"]);
	});

	test("takes a shipping cost of zero past validation", async () => {
		const res = await send("POST", "/purchase-orders/1/receive", {
			...receipt,
			shippingCost: 0,
		});
		expect(res.status).toBe(404);
		expect(await res.text()).toBe(JSON.stringify({ error: "not_found" }));
	});
});
