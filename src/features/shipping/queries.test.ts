import { beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { Hono } from "hono";
import { hc } from "hono/client";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { shippingRouter } = await import("#/server/routes/admin/shipping");
const app = new Hono<AdminEnv>().basePath("/api").route(
	"/admin",
	new Hono<AdminEnv>()
		.use(async (c, next) => {
			c.set("adminUserId", "admin");
			await next();
		})
		.route("/shipping-zones", shippingRouter),
);
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
const { activeZonesQuery, zonesQuery } = await import("./queries");
const { zoneSearchDefaults } = await import("./search");

beforeEach(() => {
	const db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es');
insert into shipping_zones (slug, method, fee, delivery_days_min, delivery_days_max, position, status) values
	('centro', 'own_delivery', 300, 1, 2, 1, 'active'),
	('retiro', 'pickup', 0, 0, 0, 0, 'active'),
	('norte', 'courier', 900, 3, 5, 2, 'archived');
insert into shipping_zone_translations (zone_id, locale, name) values (1, 'es', 'Centro'), (2, 'es', 'Retiro'), (3, 'es', 'Norte');
`);
	env.DB = d1(db);
});

describe("activeZonesQuery", () => {
	test("is the active zones an order can be confirmed with, with what the dialog shows of each", async () => {
		const zones = await new QueryClient().fetchQuery(activeZonesQuery);
		expect(zones).toEqual([
			{
				id: 2,
				slug: "retiro",
				method: "pickup",
				fee: 0,
				coversRest: false,
				deliveryDaysMin: 0,
				deliveryDaysMax: 0,
				translations: [{ zoneId: 2, locale: "es", name: "Retiro" }],
				municipalities: [],
			},
			{
				id: 1,
				slug: "centro",
				method: "own_delivery",
				fee: 300,
				coversRest: false,
				deliveryDaysMin: 1,
				deliveryDaysMax: 2,
				translations: [{ zoneId: 1, locale: "es", name: "Centro" }],
				municipalities: [],
			},
		]);
	});

	test("shares the key of the zones table, so one invalidation refreshes both", () => {
		const list = zonesQuery(zoneSearchDefaults).queryKey;
		expect(activeZonesQuery.queryKey[0]).toBe(list[0]);
		expect(activeZonesQuery.queryKey[1]).toBe(list[1]);
		expect(activeZonesQuery.queryKey[2]).toBe("options");
		expect(list[2]).toBe("list");
	});
});

describe("zonesQuery", () => {
	test("asks for the page the search names, and the API takes it", async () => {
		const queryClient = new QueryClient();
		const all = await queryClient.fetchQuery(zonesQuery(zoneSearchDefaults));
		expect(all).toMatchObject({
			total: 3,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		expect(all.items.map((zone) => zone.slug)).toEqual([
			"retiro",
			"centro",
			"norte",
		]);
		const archived = await queryClient.fetchQuery(
			zonesQuery({ ...zoneSearchDefaults, status: "archived", sort: "fee" }),
		);
		expect(archived.items.map((zone) => zone.slug)).toEqual(["norte"]);
		const courier = await queryClient.fetchQuery(
			zonesQuery({ ...zoneSearchDefaults, method: "courier" }),
		);
		expect(courier.total).toBe(1);
	});
});
