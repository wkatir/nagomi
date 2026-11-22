import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { apiError } = await import("../api-error");
const { storefront } = await import("./storefront");

const app = new Hono().route("/", storefront).onError(apiError);
const get = async (path: string) => {
	const res = await app.request(path);
	return {
		status: res.status,
		body: (await res.json()) as Record<string, unknown>,
	};
};

beforeEach(() => {
	const db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold, free_shipping_from, instagram_url, discord_url) values (1, 'Nagomi', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5, 5000, 'https://instagram.com/nagomi.sv', 'https://discord.gg/nagomi');
insert into shipping_zones (id, slug, method, fee, delivery_days_min, delivery_days_max, covers_rest, position) values (1, 'metro', 'own_delivery', 350, 1, 2, 0, 0), (2, 'resto', 'courier', 500, 2, 4, 1, 1);
insert into shipping_zone_translations (zone_id, locale, name) values (1, 'es', 'Gran San Salvador'), (1, 'en', 'Greater San Salvador'), (2, 'es', 'Resto del país');
insert into shipping_zone_municipalities (municipality, zone_id) values ('San Salvador Centro', 1), ('La Libertad Sur', 1);
insert into store_payment_methods (method, position, max_total, shipping_zone_id) values ('card', 0, null, null), ('cash_on_delivery', 1, 15000, 1);
insert into pages (slug, is_published, footer_position) values ('about', 1, 1), ('terms', 1, 2), ('privacy', 1, null), ('draft', 0, 3);
insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', 1, 'Sobre nosotros', 'x'), (1, 'en', 1, 'About us', 'x'), (2, 'es', 1, 'Términos', 'x'), (2, 'es', 2, 'Términos y condiciones', 'x'), (3, 'es', 1, 'Privacidad', 'x'), (4, 'es', 1, 'Borrador', 'x');
`);
	env.DB = d1(db);
});

describe("GET /store", () => {
	test("has the footer pages in order with their latest titles, the social links and the thresholds", async () => {
		const { status, body } = await get("/store");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			name: "Nagomi",
			freeShippingFrom: 5000,
			lowStockThreshold: 5,
			paymentMethods: ["card", "cash_on_delivery"],
			paymentOptions: [
				{ method: "card", maxTotal: null, shippingZoneSlug: null },
				{
					method: "cash_on_delivery",
					maxTotal: 15000,
					shippingZoneSlug: "metro",
				},
			],
			footerPages: [
				{ slug: "about", titles: { es: "Sobre nosotros", en: "About us" } },
				{ slug: "terms", titles: { es: "Términos y condiciones" } },
			],
			social: {
				discord: "https://discord.gg/nagomi",
				instagram: "https://instagram.com/nagomi.sv",
				tiktok: null,
				youtube: null,
			},
		});
	});
});

describe("GET /shipping/quote", () => {
	const quote = (municipality: string, merchandise: number, locale = "es") =>
		get(
			`/shipping/quote?locale=${locale}&municipality=${encodeURIComponent(municipality)}&merchandise=${merchandise}`,
		);

	test("a listed municipality gets its zone's fee, waived from the store's amount", async () => {
		expect((await quote("La Libertad Sur", 4999)).body).toMatchObject({
			zone: "metro",
			name: "Gran San Salvador",
			fee: 350,
			deliveryDaysMin: 1,
			deliveryDaysMax: 2,
		});
		expect((await quote("La Libertad Sur", 5000)).body).toMatchObject({
			fee: 0,
			baseFee: 350,
		});
		expect((await quote("San Salvador Centro", 100, "en")).body.name).toBe(
			"Greater San Salvador",
		);
	});

	test("any other municipality gets the zone that covers the rest", async () => {
		expect((await quote("San Miguel Centro", 1000)).body).toMatchObject({
			zone: "resto",
			fee: 500,
			deliveryDaysMin: 2,
			deliveryDaysMax: 4,
		});
	});

	test("refuses a municipality that does not exist", async () => {
		expect((await quote("Springfield", 1000)).status).toBe(400);
	});
});
