import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";
import { sha256Hex } from "../../domain/hash";
import { mediaKey } from "../../domain/images";

// A 40 x 30 PNG.
const png = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAACgAAAAeAQMAAABkE86eAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6goGAAgQwb5PVQAAAAxJREFUCNdjYBh6AAAAtAABXnGQvwAAAABJRU5ErkJggg==",
		"base64",
	),
);
const pngKey = mediaKey(await sha256Hex(png), "image/png");

const objects = new Map<string, Uint8Array>();
const env: { DB?: ReturnType<typeof d1>; MEDIA: unknown } = {
	MEDIA: {
		head: async (key: string) => (objects.has(key) ? {} : null),
		put: async (key: string, bytes: Uint8Array) => {
			objects.set(key, bytes);
		},
	},
};
mock.module("cloudflare:workers", () => ({ env }));
const { mediaFilesRouter, mediaRouter } = await import("./media");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/product-images", mediaRouter)
	.route("/media", mediaFilesRouter);

// The body as plain data: Hono types it from the handlers, which is no use here.
const body = (res: Response): Promise<unknown> => res.json();

const upload = (path: string, fields: Record<string, string>) => {
	const form = new FormData();
	form.set("file", new File([png], "photo.png", { type: "image/png" }));
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return app.request(path, { method: "POST", body: form });
};
const photo = (productId: number) =>
	upload("/product-images", {
		productId: String(productId),
		kind: "packshot",
		"alt.es": "Un frasco",
	});

let db: Database;
const count = (table: string) =>
	(db.query(`select count(*) as n from ${table}`).get() as { n: number }).n;

beforeEach(() => {
	objects.clear();
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale) values (1, 'Store', 'USD', 'es');
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('c', 'package', 1);
insert into products (slug, brand_id, category_id) values ('p', 1, 1), ('q', 1, 1);
`);
	env.DB = d1(db);
});

describe("POST /product-images", () => {
	test("stores the file once and the photo points at it", async () => {
		const res = await photo(1);
		expect(res.status).toBe(201);
		expect(await body(res)).toMatchObject({
			productId: 1,
			kind: "packshot",
			contentType: "image/png",
			width: 40,
			height: 30,
			url: `/media/${pngKey}`,
			alt: { es: "Un frasco" },
		});
		expect(objects.has(pngKey)).toBe(true);
		expect(count("media_files")).toBe(1);
		expect(count("product_images")).toBe(1);
		expect(
			db.query("select media_file_id as id from product_images").get(),
		).toEqual({ id: 1 });
	});

	test("the same file twice on a product is a duplicate and writes nothing", async () => {
		await photo(1);
		const res = await photo(1);
		expect(res.status).toBe(409);
		expect(await body(res)).toEqual({ error: "duplicate_image" });
		expect(count("product_images")).toBe(1);
		expect(count("media_files")).toBe(1);
	});

	test("another product reuses the file instead of storing it again", async () => {
		await photo(1);
		const res = await photo(2);
		expect(res.status).toBe(201);
		expect(count("media_files")).toBe(1);
		expect(count("product_images")).toBe(2);
	});

	test("a file uploaded as a media file first is reused by the photo", async () => {
		const first = await upload("/media", {});
		expect(first.status).toBe(201);
		const res = await photo(1);
		expect(res.status).toBe(201);
		expect(count("media_files")).toBe(1);
		expect(
			db.query("select media_file_id as id from product_images").get(),
		).toEqual({ id: 1 });
	});

	test("an archived photo can be uploaded again", async () => {
		const created = (await (await photo(1)).json()) as { id: number };
		const archived = await app.request(`/product-images/${created.id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ status: "archived" }),
		});
		expect(archived.status).toBe(200);
		const again = await photo(1);
		expect(again.status).toBe(201);
		expect(count("product_images")).toBe(2);
		expect(count("media_files")).toBe(1);
	});

	test("a default-locale alt text is required before anything is stored", async () => {
		const res = await upload("/product-images", {
			productId: "1",
			kind: "packshot",
			"alt.en": "A bottle",
		});
		expect(res.status).toBe(409);
		expect(count("media_files")).toBe(0);
		expect(objects.size).toBe(0);
	});
});
