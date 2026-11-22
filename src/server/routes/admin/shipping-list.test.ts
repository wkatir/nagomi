import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { apiError } = await import("#/server/api-error");
const { shippingRouter } = await import("./shipping");

const app = new Hono<AdminEnv>()
	.onError(apiError)
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/shipping-zones", shippingRouter);

type Zone = {
	id: number;
	slug: string;
	method: string;
	fee: number;
	status: string;
	translations: { locale: string; name: string; description: string | null }[];
};
type Page = {
	items: Zone[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/shipping-zones${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const ids = (page: Page) => page.items.map((z) => z.id);

const send = (method: string, path: string, body: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

let db: Database;

function zone(z: {
	slug: string;
	method: "pickup" | "own_delivery" | "courier";
	fee: number;
	days: [number, number];
	position: number;
	status?: "active" | "archived";
	names: [locale: string, name: string][];
}) {
	db.prepare(
		"insert into shipping_zones (slug, method, fee, delivery_days_min, delivery_days_max, position, status) values (?, ?, ?, ?, ?, ?, ?)",
	).run(
		z.slug,
		z.method,
		z.fee,
		z.days[0],
		z.days[1],
		z.position,
		z.status ?? "active",
	);
	for (const [locale, name] of z.names)
		db.prepare(
			"insert into shipping_zone_translations (zone_id, locale, name) values ((select max(id) from shipping_zones), ?, ?)",
		).run(locale, name);
}

const stored = (id: number) =>
	db.query("select * from shipping_zones where id = ?").get(id) as {
		slug: string;
		method: string;
		fee: number;
		covers_rest: number;
		delivery_days_min: number;
		delivery_days_max: number;
		position: number;
		status: string;
	};
const names = (id: number) =>
	db
		.query(
			"select locale, name, description from shipping_zone_translations where zone_id = ? order by locale",
		)
		.all(id) as {
		locale: string;
		name: string;
		description: string | null;
	}[];

beforeEach(() => {
	db = migratedDatabase();
	db.exec(
		"insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es')",
	);
	env.DB = d1(db);
	zone({
		slug: "centro",
		method: "own_delivery",
		fee: 300,
		days: [1, 2],
		position: 2,
		names: [
			["es", "Centro"],
			["en", "Downtown"],
		],
	});
	zone({
		slug: "retiro",
		method: "pickup",
		fee: 0,
		days: [0, 0],
		position: 0,
		names: [["es", "Retiro"]],
	});
	zone({
		slug: "nacional",
		method: "courier",
		fee: 500,
		days: [3, 5],
		position: 1,
		names: [["es", "Nacional"]],
	});
	zone({
		slug: "norte",
		method: "own_delivery",
		fee: 900,
		days: [1, 1],
		position: 3,
		status: "archived",
		names: [["es", "Zona norte"]],
	});
	// Archived without a name in the store's language.
	zone({
		slug: "sin-nombre",
		method: "courier",
		fee: 100,
		days: [1, 2],
		position: 4,
		status: "archived",
		names: [["en", "Nameless"]],
	});
});

describe("GET /shipping-zones", () => {
	test("pages the zones in the order the store set, with the total and the texts of each", async () => {
		const page = await list();
		expect(ids(page)).toEqual([2, 3, 1, 4, 5]);
		expect(page).toMatchObject({
			total: 5,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const centro = page.items.find((z) => z.slug === "centro");
		expect(centro).toMatchObject({
			method: "own_delivery",
			fee: 300,
			coversRest: false,
			municipalities: [],
			deliveryDaysMin: 1,
			deliveryDaysMax: 2,
			position: 2,
			status: "active",
		});
		expect(centro?.translations.map((t) => [t.locale, t.name]).sort()).toEqual([
			["en", "Downtown"],
			["es", "Centro"],
		]);
		expect(
			page.items.find((z) => z.slug === "retiro")?.translations,
		).toHaveLength(1);
	});

	test("takes the page size and page the screen asks for, and answers a page past the end empty", async () => {
		for (let n = 6; n <= 17; n++)
			zone({
				slug: `zona-${n}`,
				method: "courier",
				fee: 100,
				days: [1, 2],
				position: n,
				names: [["es", `Zona ${n}`]],
			});
		const first = await list("pageSize=10");
		expect(ids(first)).toEqual([2, 3, 1, 4, 5, 6, 7, 8, 9, 10]);
		expect(first).toMatchObject({ total: 17, pageSize: 10, pageCount: 2 });
		const second = await list("pageSize=10&page=2");
		expect(ids(second)).toEqual([11, 12, 13, 14, 15, 16, 17]);
		const past = await list("pageSize=10&page=9");
		expect(past).toMatchObject({ items: [], total: 17, page: 9, pageCount: 2 });
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			ids(await list(`sort=${sort}&dir=${dir}`));
		expect(await sorted("position", "asc")).toEqual([2, 3, 1, 4, 5]);
		expect(await sorted("position", "desc")).toEqual([5, 4, 1, 3, 2]);
		// By name in the default language: the zone without one comes first.
		expect(await sorted("name", "asc")).toEqual([5, 1, 3, 2, 4]);
		expect(await sorted("name", "desc")).toEqual([4, 2, 3, 1, 5]);
		expect(await sorted("method", "asc")).toEqual([3, 5, 1, 4, 2]);
		expect(await sorted("method", "desc")).toEqual([2, 4, 1, 5, 3]);
		expect(await sorted("fee", "asc")).toEqual([2, 5, 1, 3, 4]);
		expect(await sorted("fee", "desc")).toEqual([4, 3, 1, 5, 2]);
		// The earliest delivery decides, then the latest; zones 1 and 5 tie.
		expect(await sorted("deliveryDays", "asc")).toEqual([2, 4, 1, 5, 3]);
		expect(await sorted("deliveryDays", "desc")).toEqual([3, 5, 1, 4, 2]);
	});

	test("filters by status and method, and the total follows", async () => {
		expect(ids(await list("status=active"))).toEqual([2, 3, 1]);
		const archived = await list("status=archived");
		expect(ids(archived)).toEqual([4, 5]);
		expect(archived.total).toBe(2);
		expect(ids(await list("method=own_delivery"))).toEqual([1, 4]);
		expect(ids(await list("method=courier&status=archived"))).toEqual([5]);
		const none = await list("method=pickup&status=archived");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
	});

	test("refuses an unknown sort, a page size it does not offer, and a status or method it does not have", async () => {
		for (const query of [
			"sort=slug",
			"sort=coversRest",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"status=inactive",
			"method=drone",
		]) {
			const res = await app.request(`/shipping-zones?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});

describe("GET /shipping-zones/options", () => {
	test("is the active zones in the store's order, with only what a confirmation shows", async () => {
		const res = await app.request("/shipping-zones/options");
		expect(res.status).toBe(200);
		const options = (await res.json()) as {
			id: number;
			translations: { zoneId: number; locale: string; name: string }[];
		}[];
		expect(options.map((o) => o.id)).toEqual([2, 3, 1]);
		expect(options[2]).toMatchObject({
			id: 1,
			method: "own_delivery",
			fee: 300,
			deliveryDaysMin: 1,
			deliveryDaysMax: 2,
		});
		expect(Object.keys(options[2]).sort()).toEqual([
			"coversRest",
			"deliveryDaysMax",
			"deliveryDaysMin",
			"fee",
			"id",
			"method",
			"municipalities",
			"slug",
			"translations",
		]);
		expect(
			options[2].translations.map((t) => [t.zoneId, t.locale, t.name]).sort(),
		).toEqual([
			[1, "en", "Downtown"],
			[1, "es", "Centro"],
		]);
		// Nothing of the archived zones, not even their texts.
		expect(
			options.flatMap((o) => o.translations).map((t) => t.zoneId),
		).not.toContain(4);
	});

	test("is empty while no zone is active", async () => {
		db.exec("update shipping_zones set status = 'archived'");
		const res = await app.request("/shipping-zones/options");
		expect(await res.text()).toBe("[]");
	});
});

describe("GET /shipping-zones/:id", () => {
	test("is the zone with its texts", async () => {
		const res = await app.request("/shipping-zones/1");
		expect(res.status).toBe(200);
		const found = (await res.json()) as Zone;
		expect(found).toMatchObject({ id: 1, slug: "centro", status: "active" });
		expect(found.translations).toHaveLength(2);
		const archived = (await (
			await app.request("/shipping-zones/4")
		).json()) as Zone;
		expect(archived).toMatchObject({ id: 4, status: "archived" });
	});

	test("answers 404 for a zone that does not exist and 400 for a bad id", async () => {
		expect((await app.request("/shipping-zones/99")).status).toBe(404);
		expect((await app.request("/shipping-zones/abc")).status).toBe(400);
	});
});

describe("POST /shipping-zones", () => {
	const create = (body: Record<string, unknown>) =>
		send("POST", "/shipping-zones", {
			slug: "nueva",
			method: "own_delivery",
			fee: 250,
			municipalities: ["San Salvador Centro", "La Libertad Sur"],
			deliveryDaysMin: 1,
			deliveryDaysMax: 3,
			translations: { es: { name: "Nueva", description: "" } },
			...body,
		});

	test("creates an active zone with its texts and returns it whole", async () => {
		const res = await create({
			translations: {
				es: { name: "Nueva", description: "Entrega en el día" },
				en: { name: "New", description: "" },
			},
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as Zone;
		expect(created).toMatchObject({
			id: 6,
			slug: "nueva",
			fee: 250,
			coversRest: false,
			municipalities: ["La Libertad Sur", "San Salvador Centro"],
			position: 0,
			status: "active",
		});
		expect(created.translations).toHaveLength(2);
		expect(names(6)).toEqual([
			{ locale: "en", name: "New", description: null },
			{ locale: "es", name: "Nueva", description: "Entrega en el día" },
		]);
		expect(db.query("select action from audit_events").all()).toEqual([
			{ action: "shipping_zone.create" },
		]);
	});

	test("refuses a slug that exists, a missing default name and days out of order", async () => {
		const taken = await create({ slug: "centro" });
		expect(taken.status).toBe(409);
		expect(await taken.text()).toBe(
			JSON.stringify({ error: "duplicate_slug" }),
		);
		const untranslated = await create({
			translations: { en: { name: "New", description: "" } },
		});
		expect(untranslated.status).toBe(409);
		expect(await untranslated.text()).toBe(
			JSON.stringify({
				error: "publish_requires_default_translation",
			}),
		);
		for (const [body, path] of [
			[{ deliveryDaysMin: 4 }, "deliveryDaysMax"],
			[{ fee: -1 }, "fee"],
			[{ slug: "Con Espacio" }, "slug"],
			[{ method: "drone" }, "method"],
			[{ municipalities: ["Springfield"] }, "municipalities.0"],
			[
				{ translations: { es: { name: "", description: "" } } },
				"translations.es.name",
			],
		] as const) {
			const res = await create(body);
			expect(res.status).toBe(400);
			const json = (await res.json()) as { issues: { path: string }[] };
			expect(json.issues.map((i) => i.path)).toContain(path);
		}
		expect(db.query("select count(*) as n from shipping_zones").get()).toEqual({
			n: 5,
		});
	});
});

describe("the municipalities a zone serves", () => {
	test("a municipality belongs to one zone, and the zone that covers the rest lists none", async () => {
		const first = await send("PATCH", "/shipping-zones/1", {
			municipalities: ["San Salvador Centro"],
		});
		expect(first.status).toBe(200);
		const taken = await send("PATCH", "/shipping-zones/2", {
			municipalities: ["San Salvador Centro"],
		});
		expect(taken.status).toBe(409);
		expect((await taken.json()) as unknown).toEqual({
			error: "municipality_in_other_zone",
			taken: ["San Salvador Centro"],
		});
		const rest = await send("PATCH", "/shipping-zones/1", {
			coversRest: true,
		});
		expect(rest.status).toBe(409);
		expect((await rest.json()) as unknown).toEqual({
			error: "zone_covers_rest",
		});
		const cleared = await send("PATCH", "/shipping-zones/1", {
			coversRest: true,
			municipalities: [],
		});
		expect(cleared.status).toBe(200);
		expect(await cleared.json()).toMatchObject({
			coversRest: true,
			municipalities: [],
		});
	});
});

describe("PATCH /shipping-zones/:id", () => {
	const patch = (id: number, body: unknown) =>
		send("PATCH", `/shipping-zones/${id}`, body);

	test("changes the fields and the texts of several languages in one write", async () => {
		const res = await patch(1, {
			fee: 450,
			municipalities: ["San Salvador Norte"],
			deliveryDaysMin: 2,
			deliveryDaysMax: 4,
			position: 7,
			translations: {
				es: { name: "Centro histórico", description: "Dentro del casco" },
				en: { name: "Old town", description: "" },
			},
		});
		expect(res.status).toBe(200);
		const updated = (await res.json()) as Zone;
		expect(updated).toMatchObject({
			fee: 450,
			municipalities: ["San Salvador Norte"],
			position: 7,
			status: "active",
		});
		expect(updated.translations).toHaveLength(2);
		expect(stored(1)).toMatchObject({
			fee: 450,
			delivery_days_min: 2,
			delivery_days_max: 4,
			position: 7,
		});
		expect(names(1)).toEqual([
			{ locale: "en", name: "Old town", description: null },
			{
				locale: "es",
				name: "Centro histórico",
				description: "Dentro del casco",
			},
		]);
		expect(db.query("select action from audit_events").all()).toEqual([
			{ action: "shipping_zone.update" },
		]);
	});

	test("adds a language with only the texts", async () => {
		const res = await patch(2, {
			translations: { en: { name: "Pick up", description: "" } },
		});
		expect(res.status).toBe(200);
		expect(names(2)).toEqual([
			{ locale: "en", name: "Pick up", description: null },
			{ locale: "es", name: "Retiro", description: null },
		]);
		expect(stored(2).fee).toBe(0);
	});

	test("archives, and records the move", async () => {
		const res = await patch(1, { status: "archived" });
		expect(res.status).toBe(200);
		expect(stored(1).status).toBe("archived");
		expect(db.query("select action from audit_events").all()).toEqual([
			{ action: "shipping_zone.archive" },
		]);
	});

	test("restores a zone with a name sent in the same write", async () => {
		const refused = await patch(5, { status: "active" });
		expect(refused.status).toBe(409);
		expect(await refused.text()).toBe(
			JSON.stringify({
				error: "publish_requires_default_translation",
			}),
		);
		expect(stored(5).status).toBe("archived");
		const restored = await patch(5, {
			status: "active",
			translations: { es: { name: "Sin nombre", description: "" } },
		});
		expect(restored.status).toBe(200);
		expect(stored(5).status).toBe("active");
		expect(names(5).map((n) => n.locale)).toEqual(["en", "es"]);
	});

	test("refuses days out of order, an empty change and a zone that does not exist, writing nothing", async () => {
		const days = await patch(1, { deliveryDaysMin: 9 });
		expect(days.status).toBe(400);
		expect(await days.json()).toMatchObject({
			error: "invalid_request",
			issues: [{ path: "deliveryDaysMax" }],
		});
		for (const body of [
			{},
			{ translations: {} },
			{ fee: -5 },
			{ translations: { es: { name: " ", description: "" } } },
		]) {
			const res = await patch(1, body);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
		expect((await patch(99, { fee: 1 })).status).toBe(404);
		expect(stored(1)).toMatchObject({ fee: 300, delivery_days_min: 1 });
		expect(names(1).map((n) => n.name)).toEqual(["Downtown", "Centro"]);
		expect(db.query("select count(*) as n from audit_events").get()).toEqual({
			n: 0,
		});
	});
});
