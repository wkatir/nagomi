import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { settingsRouter } = await import("./settings");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/settings", settingsRouter);

const send = (method: string, path: string, body?: unknown) =>
	app.request(`/settings${path}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
// The body as plain data: Hono types it from the handlers, which is no use here.
const body = (res: Response): Promise<unknown> => res.json();

let db: Database;
const row = <T>(sql: string) => db.query(sql).get() as T;
const stored = () =>
	row<Record<string, unknown>>("select * from store_settings where id = 1");

beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'EC', 10, 5);
`);
	env.DB = d1(db);
});

describe("GET /settings", () => {
	test("answers the settings with the payment methods in their order and their limits", async () => {
		db.exec(`
insert into shipping_zones (id, slug, method, fee, delivery_days_min, delivery_days_max) values (1, 'metro', 'own_delivery', 350, 1, 2);
insert into store_payment_methods (method, position, max_total, shipping_zone_id) values ('cash_on_delivery', 2, 15000, 1), ('card', 1, null, null);
`);
		const res = await send("GET", "");
		expect(res.status).toBe(200);
		expect(await body(res)).toMatchObject({
			name: "Store",
			currency: "USD",
			defaultLocale: "es",
			paymentOptions: [
				{ method: "card", maxTotal: null, shippingZoneSlug: null },
				{
					method: "cash_on_delivery",
					maxTotal: 15000,
					shippingZoneId: 1,
					shippingZoneSlug: "metro",
				},
			],
		});
	});
});

describe("PATCH /settings", () => {
	test("changes the fields given and leaves the others, as one card of the screen does", async () => {
		const res = await send("PATCH", "", {
			legalName: "Nagomi S.A.",
			taxIdLabel: "NIT",
			taxId: "0614-010101-101-0",
			address: "San Salvador",
			phone: "2222-2222",
			email: "hola@example.com",
		});
		expect(res.status).toBe(200);
		expect(stored()).toMatchObject({
			name: "Store",
			currency: "USD",
			legal_name: "Nagomi S.A.",
			tax_id_label: "NIT",
			tax_id: "0614-010101-101-0",
			address: "San Salvador",
			phone: "2222-2222",
			email: "hola@example.com",
			time_zone: "America/El_Salvador",
			max_quantity_per_line: 10,
		});
	});

	test("stores a blank optional text as null", async () => {
		await send("PATCH", "", { legalName: "Nagomi", phone: "2222-2222" });
		const res = await send("PATCH", "", { legalName: "  ", phone: "" });
		expect(res.status).toBe(200);
		expect(stored()).toMatchObject({ legal_name: null, phone: null });
	});

	test("a tax ID needs its name", async () => {
		const res = await send("PATCH", "", { taxId: "123" });
		expect(res.status).toBe(400);
		expect(await body(res)).toMatchObject({
			error: "invalid_request",
			issues: [{ path: "taxIdLabel" }],
		});
		expect(stored().tax_id).toBeNull();
		expect(
			(await send("PATCH", "", { taxId: "123", taxIdLabel: "NIT" })).status,
		).toBe(200);
	});

	test("refuses a time zone, country, currency or prefix that does not exist, naming the field", async () => {
		for (const [field, value] of [
			["timeZone", "Mars/Olympus"],
			["countryCode", "ZZ"],
			["currency", "XXX1"],
			["orderCodePrefix", "ec"],
			["maxQuantityPerLine", 0],
			["lowStockThreshold", -1],
			["frequentCustomerMinOrders", 1],
			["inactiveCustomerDays", 0],
			["followupPendingPaymentHours", 0],
			["freeShippingFrom", -1],
			["instagramUrl", "http://instagram.com/nagomi"],
			["youtubeUrl", "not a url"],
			["returnWindowDays", 366],
			["foundingYear", 1899],
			["whatsappNumber", "123"],
			["email", "not-an-email"],
		] as const) {
			const res = await send("PATCH", "", { [field]: value });
			expect(res.status).toBe(400);
			const { issues } = (await body(res)) as { issues: { path: string }[] };
			expect(issues.length).toBeGreaterThan(0);
			expect(new Set(issues.map((issue) => issue.path))).toEqual(
				new Set([field]),
			);
		}
	});

	test("stores the founding year, clears it, and refuses a year that has not come", async () => {
		const set = await send("PATCH", "", { foundingYear: 2026 });
		expect(set.status).toBe(200);
		expect(stored().founding_year).toBe(2026);
		const future = await send("PATCH", "", {
			foundingYear: new Date().getFullYear() + 1,
		});
		expect(future.status).toBe(400);
		expect(stored().founding_year).toBe(2026);
		const cleared = await send("PATCH", "", { foundingYear: null });
		expect(cleared.status).toBe(200);
		expect(stored().founding_year).toBeNull();
	});

	test("a WhatsApp number of the right length must still be a real number", async () => {
		const res = await send("PATCH", "", { whatsappNumber: "12345678" });
		expect(res.status).toBe(400);
		expect(await body(res)).toEqual({
			error: "invalid_request",
			issues: [
				{
					path: "whatsappNumber",
					message: "Not a valid international phone number",
				},
			],
		});
		expect(
			(await send("PATCH", "", { whatsappNumber: "50370000000" })).status,
		).toBe(200);
	});

	test("keeps the canonical name of a time zone", async () => {
		await send("PATCH", "", { timeZone: "america/el_salvador" });
		expect(stored().time_zone).toBe("America/El_Salvador");
	});

	test("stores the thresholds, the follow-up deadlines and the social links", async () => {
		const res = await send("PATCH", "", {
			freeShippingFrom: 5000,
			lowStockThreshold: 5,
			frequentCustomerMinOrders: 3,
			inactiveCustomerDays: 90,
			followupPendingPaymentHours: 48,
			followupPaidUnshippedHours: 24,
			followupShippedUndeliveredHours: 96,
			discordUrl: "https://discord.gg/nagomi",
			instagramUrl: "https://instagram.com/nagomi.sv",
		});
		expect(res.status).toBe(200);
		expect(stored()).toMatchObject({
			free_shipping_from: 5000,
			low_stock_threshold: 5,
			frequent_customer_min_orders: 3,
			inactive_customer_days: 90,
			followup_pending_payment_hours: 48,
			followup_paid_unshipped_hours: 24,
			followup_shipped_undelivered_hours: 96,
			discord_url: "https://discord.gg/nagomi",
			instagram_url: "https://instagram.com/nagomi.sv",
		});
	});

	test("replaces the payment methods in the order given, and an empty list clears them", async () => {
		db.exec(
			"insert into shipping_zones (id, slug, method, fee, delivery_days_min, delivery_days_max) values (1, 'metro', 'own_delivery', 350, 1, 2)",
		);
		await send("PATCH", "", {
			paymentOptions: [
				{ method: "card", maxTotal: null, shippingZoneId: null },
				{ method: "cash_on_delivery", maxTotal: 15000, shippingZoneId: 1 },
			],
		});
		expect(
			db
				.query(
					"select method, position, max_total, shipping_zone_id from store_payment_methods order by position",
				)
				.all(),
		).toEqual([
			{ method: "card", position: 0, max_total: null, shipping_zone_id: null },
			{
				method: "cash_on_delivery",
				position: 1,
				max_total: 15000,
				shipping_zone_id: 1,
			},
		]);
		const res = await send("PATCH", "", { paymentOptions: [] });
		expect(res.status).toBe(200);
		expect(await body(res)).toMatchObject({ paymentOptions: [] });
		expect(db.query("select method from store_payment_methods").all()).toEqual(
			[],
		);
	});

	test("leaves the payment methods alone when the patch does not name them", async () => {
		await send("PATCH", "", {
			paymentOptions: [
				{ method: "cash", maxTotal: null, shippingZoneId: null },
			],
		});
		await send("PATCH", "", { name: "Other" });
		expect(db.query("select method from store_payment_methods").all()).toEqual([
			{ method: "cash" },
		]);
	});

	test("refuses a method twice, and a zone that does not exist", async () => {
		const cash = { method: "cash", maxTotal: null, shippingZoneId: null };
		expect(
			(await send("PATCH", "", { paymentOptions: [cash, cash] })).status,
		).toBe(400);
		const zone = await send("PATCH", "", {
			paymentOptions: [{ ...cash, shippingZoneId: 9 }],
		});
		expect(zone.status).toBe(409);
		expect(await body(zone)).toEqual({ error: "unknown_shipping_zone" });
	});

	test("writes one audit event with what it replaced", async () => {
		await send("PATCH", "", { name: "Other" });
		const event = row<{ action: string; data: string }>(
			"select action, data from audit_events",
		);
		expect(event.action).toBe("settings.update");
		expect(JSON.parse(event.data)).toMatchObject({
			before: { name: "Store" },
			patch: { name: "Other" },
		});
	});

	describe("the currency", () => {
		const order = () =>
			db.exec(
				"insert into orders (code, idempotency_key, request_hash, locale, channel, status, subtotal, total, search_key) values ('EC-1', 'k', 'h', 'es', 'whatsapp', 'pending', 1000, 1000, 'ec-1')",
			);

		test("changes while nothing has been sold or bought", async () => {
			const res = await send("PATCH", "", { currency: "EUR" });
			expect(res.status).toBe(200);
			expect(stored().currency).toBe("EUR");
		});

		test("is locked once there is an order", async () => {
			order();
			const res = await send("PATCH", "", { currency: "EUR" });
			expect(res.status).toBe(409);
			expect(await body(res)).toEqual({ error: "currency_locked" });
			expect(stored().currency).toBe("USD");
		});

		test("can be sent again unchanged once there is an order", async () => {
			order();
			const res = await send("PATCH", "", { currency: "USD", name: "Other" });
			expect(res.status).toBe(200);
			expect(stored().name).toBe("Other");
		});
	});

	describe("the main language", () => {
		const promise = (texts: [locale: string, title: string][]) => {
			db.exec(
				"insert into store_promises (id, slug, is_published) values (1, 'free', 1)",
			);
			for (const [locale, title] of texts)
				db.prepare(
					"insert into store_promise_translations (promise_id, locale, title) values (1, ?, ?)",
				).run(locale, title);
		};

		test("cannot move to a language that published content lacks", async () => {
			promise([["es", "Envío gratis"]]);
			const res = await send("PATCH", "", { defaultLocale: "en" });
			expect(res.status).toBe(409);
			expect(await body(res)).toEqual({
				error: "default_locale_untranslated",
				missing: [{ type: "promise", slug: "free" }],
			});
			expect(stored().default_locale).toBe("es");
		});

		test("moves when the content is covered", async () => {
			promise([
				["es", "Envío gratis"],
				["en", "Free shipping"],
			]);
			const res = await send("PATCH", "", { defaultLocale: "en" });
			expect(res.status).toBe(200);
			expect(stored().default_locale).toBe("en");
		});
	});

	describe("the return window", () => {
		const quoting = (published: number) => {
			db.exec(
				`insert into store_promises (id, slug, is_published) values (1, 'returns', ${published})`,
			);
			db.exec(
				"insert into store_promise_translations (promise_id, locale, title) values (1, 'es', 'Devoluciones en {return_window_days} días')",
			);
		};

		test("cannot be removed while a published promise quotes it", async () => {
			db.exec("update store_settings set return_window_days = 30");
			quoting(1);
			const res = await send("PATCH", "", { returnWindowDays: null });
			expect(res.status).toBe(409);
			expect(await body(res)).toEqual({
				error: "promise_requires_return_window",
			});
			expect(stored().return_window_days).toBe(30);
		});

		test("can be removed when the promise that quotes it is a draft", async () => {
			db.exec("update store_settings set return_window_days = 30");
			quoting(0);
			const res = await send("PATCH", "", { returnWindowDays: null });
			expect(res.status).toBe(200);
			expect(stored().return_window_days).toBeNull();
		});
	});
});

describe("promises", () => {
	beforeEach(() => {
		db.exec(`
insert into store_promises (id, slug, position) values (1, 'free', 1), (2, 'returns', 0);
insert into store_promise_translations (promise_id, locale, title, body) values (1, 'es', 'Envío gratis', NULL), (2, 'en', 'Returns', 'Easy');
`);
	});

	test("lists them by position with their texts", async () => {
		const res = await send("GET", "/promises");
		const promises = (await body(res)) as {
			slug: string;
			isPublished: boolean;
			translations: { locale: string; title: string }[];
		}[];
		expect(promises.map((p) => p.slug)).toEqual(["returns", "free"]);
		expect(promises[1].translations).toMatchObject([
			{ locale: "es", title: "Envío gratis" },
		]);
		expect(promises[0].isPublished).toBe(false);
	});

	test("a promise is published only with its text in the main language", async () => {
		const refused = await send("PATCH", "/promises/2", { isPublished: true });
		expect(refused.status).toBe(409);
		expect(await body(refused)).toEqual({
			error: "publish_requires_default_translation",
		});
		const res = await send("PATCH", "/promises/1", { isPublished: true });
		expect(res.status).toBe(200);
		expect(await body(res)).toMatchObject({ id: 1, isPublished: true });
	});

	test("a promise that quotes the return window needs one to be published", async () => {
		await send("PUT", "/promises/1/translations/es", {
			title: "Devoluciones en {return_window_days} días",
			body: null,
		});
		const refused = await send("PATCH", "/promises/1", { isPublished: true });
		expect(refused.status).toBe(409);
		expect(await body(refused)).toEqual({
			error: "promise_requires_return_window",
		});
		db.exec("update store_settings set return_window_days = 14");
		expect(
			(await send("PATCH", "/promises/1", { isPublished: true })).status,
		).toBe(200);
	});

	test("saves a text for a language, and replaces it the next time", async () => {
		const created = await send("PUT", "/promises/1/translations/en", {
			title: "Free shipping",
			body: "Over $50",
		});
		expect(created.status).toBe(200);
		await send("PUT", "/promises/1/translations/en", {
			title: "Free delivery",
			body: null,
		});
		expect(
			db
				.query(
					"select title, body from store_promise_translations where promise_id = 1 and locale = 'en'",
				)
				.all(),
		).toEqual([{ title: "Free delivery", body: null }]);
	});

	test("refuses a title that is blank or too long, and a promise that does not exist", async () => {
		for (const title of ["  ", "x".repeat(81)])
			expect(
				(
					await send("PUT", "/promises/1/translations/es", {
						title,
						body: null,
					})
				).status,
			).toBe(400);
		const missing = await send("PUT", "/promises/9/translations/es", {
			title: "Hola",
			body: null,
		});
		expect(missing.status).toBe(404);
	});

	test("does not let a published promise start quoting a return window that is not set", async () => {
		db.exec("update store_settings set return_window_days = 14");
		await send("PATCH", "/promises/1", { isPublished: true });
		db.exec("update store_settings set return_window_days = NULL");
		const res = await send("PUT", "/promises/1/translations/es", {
			title: "Devoluciones en {return_window_days} días",
			body: null,
		});
		expect(res.status).toBe(409);
		expect(await body(res)).toEqual({
			error: "promise_requires_return_window",
		});
	});
});

describe("pages", () => {
	beforeEach(() => {
		db.exec(`
insert into users (id, name, email, role) values ('admin', 'Wilmer', 'w@example.com', 'admin');
insert into pages (id, slug, is_published) values (1, 'privacy', 1), (2, 'terms', 1);
insert into page_versions (page_id, locale, version, title, body_markdown, created_at, created_by) values (1, 'es', 1, 'Privacidad', 'v1', '2026-10-01T10:00:00Z', NULL), (1, 'es', 2, 'Privacidad', 'v2', '2026-10-02T10:00:00Z', 'admin'), (1, 'en', 1, 'Privacy', 'en v1', '2026-10-01T10:00:00Z', NULL), (2, 'es', 1, 'Términos', 't1', '2026-10-01T10:00:00Z', NULL);
`);
	});

	type Texts = {
		slug: string;
		translations: {
			locale: string;
			version: number;
			bodyMarkdown: string;
			createdAt: string;
		}[];
	}[];

	test("lists the pages with the current text of each language and its version", async () => {
		const pages = (await body(await send("GET", "/pages"))) as Texts;
		expect(pages.map((p) => p.slug)).toEqual(["privacy", "terms"]);
		const privacy = pages[0].translations.map((t) => [
			t.locale,
			t.version,
			t.bodyMarkdown,
			t.createdAt,
		]);
		expect(privacy).toEqual(
			expect.arrayContaining([
				["es", 2, "v2", "2026-10-02T10:00:00Z"],
				["en", 1, "en v1", "2026-10-01T10:00:00Z"],
			]),
		);
		expect(privacy).toHaveLength(2);
	});

	test("saving a text is a new version of that language only", async () => {
		const res = await send("PUT", "/pages/1/translations/en", {
			title: "Privacy notice",
			bodyMarkdown: "en v2",
		});
		expect(res.status).toBe(200);
		expect(
			db
				.query(
					"select locale, version, created_by from page_versions where page_id = 1 and body_markdown = 'en v2'",
				)
				.all(),
		).toEqual([{ locale: "en", version: 2, created_by: "admin" }]);
		expect(
			row<{ n: number }>(
				"select count(*) as n from page_versions where page_id = 1 and locale = 'es'",
			).n,
		).toBe(2);
		await send("PUT", "/pages/1/translations/es", {
			title: "Privacidad",
			bodyMarkdown: "v3",
		});
		expect(
			row<{ version: number }>(
				"select max(version) as version from page_versions where page_id = 1 and locale = 'es'",
			).version,
		).toBe(3);
	});

	test("refuses an empty text and a page that does not exist", async () => {
		for (const patch of [
			{ title: " ", bodyMarkdown: "x" },
			{ title: "x", bodyMarkdown: " " },
		])
			expect(
				(await send("PUT", "/pages/1/translations/es", patch)).status,
			).toBe(400);
		const missing = await send("PUT", "/pages/9/translations/es", {
			title: "x",
			bodyMarkdown: "x",
		});
		expect(missing.status).toBe(404);
	});

	type Versions = {
		items: {
			id: number;
			version: number;
			title: string;
			bodyMarkdown: string;
			createdAt: string;
			author: string | null;
		}[];
		nextCursor: number | null;
	};
	const versions = async (query: string): Promise<Versions> => {
		const res = await send("GET", `/pages/1/versions${query}`);
		expect(res.status).toBe(200);
		return res.json();
	};

	test("lists the versions of one language newest first, with who saved each", async () => {
		const es = await versions("?locale=es");
		expect(es.items.map((v) => [v.version, v.bodyMarkdown, v.author])).toEqual([
			[2, "v2", "Wilmer"],
			[1, "v1", null],
		]);
		expect(es.items[0].createdAt).toBe("2026-10-02T10:00:00Z");
		expect(es.nextCursor).toBeNull();
		expect((await versions("?locale=en")).items.map((v) => v.version)).toEqual([
			1,
		]);
	});

	test("goes through the versions a page at a time", async () => {
		for (const n of [3, 4, 5])
			db.exec(
				`insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', ${n}, 'T', 'v${n}')`,
			);
		const first = await versions("?locale=es&limit=2");
		expect(first.items.map((v) => v.version)).toEqual([5, 4]);
		expect(first.nextCursor).not.toBeNull();
		const second = await versions(
			`?locale=es&limit=2&cursor=${first.nextCursor}`,
		);
		expect(second.items.map((v) => v.version)).toEqual([3, 2]);
		const last = await versions(
			`?locale=es&limit=2&cursor=${second.nextCursor}`,
		);
		expect(last.items.map((v) => v.version)).toEqual([1]);
		expect(last.nextCursor).toBeNull();
	});

	test("does not mix the versions of two pages", async () => {
		const res = await send("GET", "/pages/2/versions?locale=es");
		expect(
			((await res.json()) as Versions).items.map((v) => v.bodyMarkdown),
		).toEqual(["t1"]);
	});

	test("needs a language, and answers 404 for a page that does not exist", async () => {
		expect((await send("GET", "/pages/1/versions")).status).toBe(400);
		expect((await send("GET", "/pages/1/versions?locale=fr")).status).toBe(400);
		expect(
			(await send("GET", "/pages/1/versions?locale=es&limit=51")).status,
		).toBe(400);
		expect((await send("GET", "/pages/9/versions?locale=es")).status).toBe(404);
	});
});
