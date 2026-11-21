import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { homeSlidesRouter } = await import("./home-slides");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/home-slides", homeSlidesRouter);

const send = (method: string, path: string, body?: unknown) =>
	app.request(path, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

type Slide = {
	id: number;
	position: number;
	status: string;
	desktopImage: { url: string } | null;
	mobileImage: { url: string } | null;
	translations: {
		slideId: number;
		locale: string;
		title: string;
		body: string | null;
		ctaLabel: string | null;
		imageAlt: string;
	}[];
};
// The body as plain data: Hono types it from the handlers, which is no use here.
const body = (res: Response): Promise<unknown> => res.json();
const slidesOf = (res: Response): Promise<Slide[]> => res.json();
const slideOf = (res: Response): Promise<Slide> => res.json();

const key = (n: number) => `${String(n).repeat(64)}.png`;

let db: Database;
const row = <T>(sql: string) => db.query(sql).get() as T;

// Three slides in the order 2, 3, 1 (by position), 1 and 3 with a Spanish text.
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es');
insert into media_files (r2_key, content_type, byte_size, width, height) values
	('${key(1)}', 'image/png', 100, 1600, 900),
	('${key(2)}', 'image/png', 100, 800, 1000);
insert into home_slides (id, status, position, desktop_media_id, mobile_media_id, link_path, updated_at) values
	(1, 'published', 2, 1, 2, '/products', '2000-01-01T00:00:00Z'),
	(2, 'draft', 0, 1, NULL, '/', '2000-01-01T00:00:00Z'),
	(3, 'archived', 1, 1, NULL, '/', '2000-01-01T00:00:00Z');
insert into home_slide_translations (slide_id, locale, title, body, cta_label, image_alt) values
	(1, 'es', 'Hola', 'Cuerpo', 'Ver', 'Alt es'),
	(1, 'en', 'Hello', NULL, NULL, 'Alt en'),
	(3, 'es', 'Tres', NULL, NULL, 'Alt tres');
`);
	env.DB = d1(db);
});

describe("GET /home-slides", () => {
	test("lists the slides by position with their images and texts", async () => {
		const res = await send("GET", "/home-slides");
		expect(res.status).toBe(200);
		const slides = await slidesOf(res);
		expect(slides.map((s) => [s.id, s.position])).toEqual([
			[2, 0],
			[3, 1],
			[1, 2],
		]);
		const first = slides[2];
		expect(first.desktopImage?.url).toEndWith(`/${key(1)}`);
		expect(first.mobileImage?.url).toEndWith(`/${key(2)}`);
		expect(first.translations.map((t) => t.locale).sort()).toEqual([
			"en",
			"es",
		]);
		expect(slides[0].mobileImage).toBeNull();
		expect(slides[0].translations).toEqual([]);
	});

	test("narrows the list to a status", async () => {
		const slides = await slidesOf(
			await send("GET", "/home-slides?status=archived"),
		);
		expect(slides.map((s) => s.id)).toEqual([3]);
	});
});

describe("PUT /home-slides/:id/translations", () => {
	test("replaces the given locales as a whole and leaves the others", async () => {
		const res = await send("PUT", "/home-slides/1/translations", {
			translations: {
				es: { title: "  Nuevo  ", imageAlt: "Alt nuevo" },
			},
		});
		expect(res.status).toBe(200);
		const slide = await slideOf(res);
		const es = slide.translations.find((t) => t.locale === "es");
		// Omitted optional fields are stored as null: the old body and label are gone.
		expect(es).toEqual({
			slideId: 1,
			locale: "es",
			title: "Nuevo",
			body: null,
			ctaLabel: null,
			imageAlt: "Alt nuevo",
		});
		expect(slide.translations.find((t) => t.locale === "en")).toMatchObject({
			title: "Hello",
			imageAlt: "Alt en",
		});
	});

	test("adds a locale the slide had no text in and updates another in the same call", async () => {
		const res = await send("PUT", "/home-slides/3/translations", {
			translations: {
				es: { title: "Tres", body: "Detalle", ctaLabel: "Ir", imageAlt: "Alt" },
				en: { title: "Three", imageAlt: "Alt three" },
			},
		});
		expect(res.status).toBe(200);
		const slide = await slideOf(res);
		expect(
			slide.translations.map((t) => [t.locale, t.title, t.body, t.ctaLabel]),
		).toEqual(
			expect.arrayContaining([
				["es", "Tres", "Detalle", "Ir"],
				["en", "Three", null, null],
			]),
		);
		expect(slide.translations).toHaveLength(2);
	});

	test("writes one audit event and touches the slide", async () => {
		await send("PUT", "/home-slides/1/translations", {
			translations: { en: { title: "Hi", imageAlt: "Alt" } },
		});
		expect(
			row<{ n: number }>(
				"select count(*) as n from audit_events where action = 'home_slide.update' and entity_id = '1'",
			).n,
		).toBe(1);
		expect(
			row<{ updated_at: string }>(
				"select updated_at from home_slides where id = 1",
			).updated_at,
		).not.toBe("2000-01-01T00:00:00Z");
	});

	test("answers 404 for a slide that does not exist", async () => {
		const res = await send("PUT", "/home-slides/99/translations", {
			translations: { es: { title: "Hola", imageAlt: "Alt" } },
		});
		expect(res.status).toBe(404);
		expect(await body(res)).toEqual({ error: "not_found" });
	});

	test("refuses an empty set, a blank title and a missing image alt, changing nothing", async () => {
		for (const translations of [
			{},
			{ es: { title: "   ", imageAlt: "Alt" } },
			{ es: { title: "Hola" } },
			{ fr: { title: "Salut", imageAlt: "Alt" } },
		]) {
			const res = await send("PUT", "/home-slides/1/translations", {
				translations,
			});
			expect(res.status).toBe(400);
		}
		expect(
			row<{ title: string }>(
				"select title from home_slide_translations where slide_id = 1 and locale = 'es'",
			).title,
		).toBe("Hola");
		expect(row<{ n: number }>("select count(*) as n from audit_events").n).toBe(
			0,
		);
	});

	test("keeps every language when one of them is invalid", async () => {
		const res = await send("PUT", "/home-slides/1/translations", {
			translations: {
				es: { title: "Cambiado", imageAlt: "Alt" },
				en: { title: "x".repeat(121), imageAlt: "Alt" },
			},
		});
		expect(res.status).toBe(400);
		expect(
			row<{ title: string }>(
				"select title from home_slide_translations where slide_id = 1 and locale = 'es'",
			).title,
		).toBe("Hola");
	});
});

describe("PUT /home-slides/order", () => {
	test("numbers the slides that are not archived in the order given", async () => {
		const res = await send("PUT", "/home-slides/order", { slideIds: [1, 2] });
		expect(res.status).toBe(200);
		expect(await body(res)).toEqual([
			{ id: 1, position: 0 },
			{ id: 2, position: 1 },
		]);
		const positions = db
			.query("select id, position from home_slides order by id")
			.all();
		expect(positions).toEqual([
			{ id: 1, position: 0 },
			{ id: 2, position: 1 },
			{ id: 3, position: 1 },
		]);
	});

	test("refuses a set that is not every slide that is not archived", async () => {
		for (const slideIds of [[1], [1, 2, 3], [1, 99]]) {
			const res = await send("PUT", "/home-slides/order", { slideIds });
			expect(res.status).toBe(409);
			expect(await body(res)).toEqual({ error: "slides_changed" });
		}
		expect(
			db.query("select id, position from home_slides order by id").all(),
		).toEqual([
			{ id: 1, position: 2 },
			{ id: 2, position: 0 },
			{ id: 3, position: 1 },
		]);
	});
});

describe("POST /home-slides", () => {
	const create = (patch: Record<string, unknown> = {}) =>
		send("POST", "/home-slides", {
			desktopMediaId: 1,
			linkPath: "/products",
			translations: { es: { title: "Nuevo", imageAlt: "Alt" } },
			...patch,
		});

	test("creates a draft with the image, the link and the text in the main language", async () => {
		const res = await create();
		expect(res.status).toBe(201);
		const slide = await slideOf(res);
		expect(slide).toMatchObject({
			status: "draft",
			desktopMediaId: 1,
			mobileMediaId: null,
			linkPath: "/products",
			startsOn: null,
			endsOn: null,
		});
		expect(slide.translations).toMatchObject([
			{ locale: "es", title: "Nuevo", body: null, ctaLabel: null },
		]);
		expect(
			row<{ n: number }>(
				"select count(*) as n from audit_events where action = 'home_slide.create'",
			).n,
		).toBe(1);
	});

	test("needs the text in the main language", async () => {
		const res = await create({
			translations: { en: { title: "New", imageAlt: "Alt" } },
		});
		expect(res.status).toBe(409);
		expect(await body(res)).toEqual({
			error: "publish_requires_default_translation",
		});
		expect(row<{ n: number }>("select count(*) as n from home_slides").n).toBe(
			3,
		);
	});

	test("refuses an image that is not in the library", async () => {
		for (const patch of [{ desktopMediaId: 99 }, { mobileMediaId: 99 }]) {
			const res = await create(patch);
			expect(res.status).toBe(409);
			expect(await body(res)).toEqual({ error: "reference_unavailable" });
		}
	});

	test("refuses a link that is not a page of the store, naming the field", async () => {
		for (const linkPath of [
			"products",
			"//evil.example",
			"/es/products",
			"/admin",
			"https://evil.example",
		]) {
			const res = await create({ linkPath });
			expect(res.status).toBe(400);
			expect(await body(res)).toMatchObject({
				issues: [{ path: "linkPath" }],
			});
		}
	});

	test("refuses an end date before the start date", async () => {
		const res = await create({ startsOn: "2026-10-20", endsOn: "2026-10-19" });
		expect(res.status).toBe(400);
		expect(await body(res)).toMatchObject({ issues: [{ path: "endsOn" }] });
		expect(
			(await create({ startsOn: "2026-10-20", endsOn: "2026-10-20" })).status,
		).toBe(201);
	});
});

describe("PATCH /home-slides/:id", () => {
	const patch = (id: number, changes: Record<string, unknown>) =>
		send("PATCH", `/home-slides/${id}`, changes);

	test("changes the images, link and dates, and clears a date with null", async () => {
		const res = await patch(1, {
			desktopMediaId: 2,
			mobileMediaId: null,
			linkPath: "/company",
			startsOn: "2026-10-01",
			endsOn: "2026-10-31",
		});
		expect(res.status).toBe(200);
		expect(await slideOf(res)).toMatchObject({
			desktopMediaId: 2,
			mobileMediaId: null,
			linkPath: "/company",
			startsOn: "2026-10-01",
			endsOn: "2026-10-31",
			status: "published",
		});
		const cleared = await patch(1, { startsOn: null });
		expect(await slideOf(cleared)).toMatchObject({
			startsOn: null,
			endsOn: "2026-10-31",
		});
	});

	test("an end date is checked against the start date that is stored", async () => {
		await patch(1, { startsOn: "2026-10-20" });
		const res = await patch(1, { endsOn: "2026-10-19" });
		expect(res.status).toBe(400);
		expect(await body(res)).toMatchObject({ issues: [{ path: "endsOn" }] });
		expect(
			row<{ ends_on: string | null }>(
				"select ends_on from home_slides where id = 1",
			).ends_on,
		).toBeNull();
	});

	test("publishes a draft that has its text in the main language", async () => {
		db.exec(
			"insert into home_slide_translations (slide_id, locale, title, image_alt) values (2, 'es', 'Dos', 'Alt')",
		);
		const res = await patch(2, { status: "published" });
		expect(res.status).toBe(200);
		expect(await slideOf(res)).toMatchObject({ status: "published" });
		expect(
			row<{ action: string }>(
				"select action from audit_events where entity_id = '2'",
			).action,
		).toBe("home_slide.status");
	});

	test("does not publish a draft without its text in the main language", async () => {
		const res = await patch(2, { status: "published" });
		expect(res.status).toBe(409);
		expect(await body(res)).toEqual({
			error: "publish_requires_default_translation",
		});
		expect(
			row<{ status: string }>("select status from home_slides where id = 2")
				.status,
		).toBe("draft");
	});

	test("moves along the lifecycle only the ways it allows", async () => {
		const unpublished = await patch(1, { status: "draft" });
		expect(unpublished.status).toBe(200);
		const archived = await patch(1, { status: "archived" });
		expect(archived.status).toBe(200);
		const published = await patch(1, { status: "published" });
		expect(published.status).toBe(409);
		expect(await body(published)).toEqual({ error: "invalid_transition" });
		expect((await patch(1, { status: "draft" })).status).toBe(200);
	});

	test("answers 404 for a slide that is not there and 400 for nothing to change", async () => {
		expect((await patch(99, { linkPath: "/" })).status).toBe(404);
		expect((await patch(1, {})).status).toBe(400);
	});
});
