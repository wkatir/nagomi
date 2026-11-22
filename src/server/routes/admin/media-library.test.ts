import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { mediaFilesRouter } = await import("./media");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/media", mediaFilesRouter);

let db: Database;

// A key is 64 hex digits and an extension.
const files = (n: number) => {
	for (let id = 1; id <= n; id++)
		db.exec(
			`insert into media_files (id, r2_key, content_type, byte_size, width, height) values (${id}, '${String(id).repeat(64)}.png', 'image/png', ${id * 100}, 40, 30)`,
		);
};

beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es');
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('c', 'package', 1);
insert into products (slug, brand_id, category_id) values ('p', 1, 1), ('q', 1, 1);
`);
	env.DB = d1(db);
});

type FileList = {
	items: { id: number; url: string }[];
	nextCursor: number | null;
};
const listFiles = async (query = ""): Promise<FileList> => {
	const res = await app.request(`/media${query}`);
	expect(res.status).toBe(200);
	return res.json();
};
// The body as plain data: Hono types it from the handlers, which is no use here.
const body = (res: Response): Promise<unknown> => res.json();

describe("GET /media", () => {
	test("lists the files newest first and gives the cursor of the next page", async () => {
		files(5);
		const first = await listFiles("?limit=2");
		expect(first.items.map((f) => f.id)).toEqual([5, 4]);
		expect(first.nextCursor).toBe(4);
		const second = await listFiles(`?limit=2&cursor=${first.nextCursor}`);
		expect(second.items.map((f) => f.id)).toEqual([3, 2]);
		expect(second.nextCursor).toBe(2);
		const last = await listFiles(`?limit=2&cursor=${second.nextCursor}`);
		expect(last.items.map((f) => f.id)).toEqual([1]);
		expect(last.nextCursor).toBeNull();
	});

	test("a page that ends exactly at the last file has no next cursor", async () => {
		files(2);
		const page = await listFiles("?limit=2");
		expect(page.items.map((f) => f.id)).toEqual([2, 1]);
		expect(page.nextCursor).toBeNull();
	});

	test("an empty library is an empty page", async () => {
		expect(await listFiles()).toEqual({ items: [], nextCursor: null });
	});

	test("refuses a page larger than 100 and a cursor that is not an id", async () => {
		for (const query of ["?limit=101", "?limit=0", "?cursor=0", "?cursor=x"])
			expect((await app.request(`/media${query}`)).status).toBe(400);
	});
});

describe("GET /media/:id", () => {
	test("answers the file with its type, size, dimensions and url", async () => {
		files(2);
		const res = await app.request("/media/2");
		expect(res.status).toBe(200);
		expect(await body(res)).toMatchObject({
			id: 2,
			contentType: "image/png",
			byteSize: 200,
			width: 40,
			height: 30,
			url: `/media/${"2".repeat(64)}.png`,
		});
	});

	test("answers 404 for a file that is not there", async () => {
		const res = await app.request("/media/9");
		expect(res.status).toBe(404);
		expect(await body(res)).toEqual({ error: "not_found" });
	});
});

type Usage = {
	slides: {
		id: number;
		status: string;
		title: string | null;
		desktop: boolean;
		mobile: boolean;
	}[];
	collections: {
		id: number;
		slug: string;
		status: string;
		title: string | null;
	}[];
	photos: {
		id: number;
		productId: number;
		slug: string;
		status: string;
		name: string | null;
	}[];
};
const usage = async (id: number): Promise<Usage> => {
	const res = await app.request(`/media/${id}/usage`);
	expect(res.status).toBe(200);
	return res.json();
};

describe("GET /media/:id/usage", () => {
	test("a file nothing points at is used nowhere", async () => {
		files(2);
		expect(await usage(1)).toEqual({ slides: [], collections: [], photos: [] });
	});

	test("lists the slides that show it, as the wide picture, the phone one or both", async () => {
		files(3);
		db.exec(`
insert into home_slides (id, status, desktop_media_id, mobile_media_id, link_path) values (1, 'published', 1, 2, '/'), (2, 'draft', 2, 1, '/'), (3, 'archived', 1, 1, '/'), (4, 'published', 3, NULL, '/');
insert into home_slide_translations (slide_id, locale, title, image_alt) values (1, 'es', 'Uno', 'a'), (1, 'en', 'One', 'a'), (3, 'en', 'Three', 'a');
`);
		expect((await usage(1)).slides).toEqual([
			{
				id: 1,
				status: "published",
				title: "Uno",
				desktop: true,
				mobile: false,
			},
			{ id: 2, status: "draft", title: null, desktop: false, mobile: true },
			{ id: 3, status: "archived", title: null, desktop: true, mobile: true },
		]);
		expect((await usage(2)).slides.map((s) => s.id)).toEqual([1, 2]);
		expect((await usage(3)).slides.map((s) => s.id)).toEqual([4]);
	});

	test("lists the collections it covers", async () => {
		files(2);
		db.exec(`
insert into collections (id, slug, status, cover_media_id) values (1, 'essentials', 'published', 1), (2, 'gifts', 'archived', 1), (3, 'other', 'draft', 2);
insert into collection_translations (collection_id, locale, title) values (1, 'es', 'Esenciales'), (2, 'en', 'Gifts');
`);
		expect((await usage(1)).collections).toEqual([
			{ id: 1, slug: "essentials", status: "published", title: "Esenciales" },
			{ id: 2, slug: "gifts", status: "archived", title: null },
		]);
	});

	test("lists the product photos made from it, archived ones included", async () => {
		files(2);
		db.exec(`
insert into product_images (id, product_id, media_file_id, kind, position, status) values (1, 1, 1, 'packshot', 1, 'active'), (2, 2, 1, 'lifestyle', 1, 'archived'), (3, 2, 2, 'detail', 2, 'active');
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite');
`);
		expect((await usage(1)).photos).toEqual([
			{ id: 1, productId: 1, slug: "p", status: "active", name: "Aceite" },
			{ id: 2, productId: 2, slug: "q", status: "archived", name: null },
		]);
		expect((await usage(2)).photos.map((p) => p.id)).toEqual([3]);
	});

	test("names the items in the main language of the store", async () => {
		files(1);
		db.exec(`
update store_settings set default_locale = 'en';
insert into collections (id, slug, status, cover_media_id) values (1, 'c', 'published', 1);
insert into collection_translations (collection_id, locale, title) values (1, 'es', 'Hola'), (1, 'en', 'Hello');
`);
		expect((await usage(1)).collections[0].title).toBe("Hello");
	});

	test("answers 404 for a file that is not there", async () => {
		const res = await app.request("/media/9/usage");
		expect(res.status).toBe(404);
		expect(await body(res)).toEqual({ error: "not_found" });
	});
});
