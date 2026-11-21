import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1> } = {};
mock.module("cloudflare:workers", () => ({ env }));
const { productsRouter } = await import("./products");
const { apiError } = await import("#/server/api-error");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/products", productsRouter)
	.onError(apiError);

const send = (method: string, path: string, body?: unknown) =>
	app.request(`/products${path}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
type Detail = {
	id: number;
	slug: string;
	status: string;
	inci: string | null;
	sanitaryRegistration: string | null;
	brandId: number;
	categoryId: number;
	concernIds: number[];
	skinTypes: string[];
	publishMissing: string[];
	translations: { locale: string; name: string; tagline: string | null }[];
	variants: {
		id: number;
		sku: string;
		price: number | null;
		skuEditable: boolean;
		onHand: number;
	}[];
};
const detail = async (id = 1) => {
	const res = await send("GET", `/${id}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Detail;
};
const errorOf = async (res: Response) =>
	((await res.json()) as { error: string }).error;

let db: Database;
const one = (sql: string) => db.query(sql).get() as Record<string, unknown>;
const count = (table: string) => one(`select count(*) as n from ${table}`).n;
const audits = (action: string) =>
	count(`audit_events where action = '${action}'`);

beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 180);
insert into brands (slug, name, search_key) values ('brand', 'Brand', 'brand brand');
insert into brands (slug, name, search_key, status) values ('old-brand', 'Old', 'old old-brand', 'archived');
insert into categories (slug, routine_step) values ('cleanser', 1);
insert into categories (slug, routine_step, status) values ('old-cat', 2, 'archived');
insert into concerns (slug) values ('acne');
insert into concerns (slug) values ('dryness');
insert into products (slug, brand_id, category_id, updated_at) values ('oil', 1, 1, '2026-01-01T00:00:00Z');
insert into product_translations (product_id, locale, name, search_key, tagline) values (1, 'es', 'Aceite', 'aceite', 'Frase');
`);
	env.DB = d1(db);
});

// An error answered by the Worker's handler is logged; the ones expected here are not news.
const consoleError = console.error;
afterEach(() => {
	console.error = consoleError;
});

const readyToPublish = () =>
	db.exec(`
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-30', 1500, 'oil-30');
`);

describe("what stops a product from being published", () => {
	test("the detail lists it in the order of the checklist, and the list shrinks as it is fixed", async () => {
		// A bare draft: a name in the default language, nothing else.
		expect((await detail()).publishMissing).toEqual(["price"]);
		db.exec("delete from product_translations");
		expect((await detail()).publishMissing).toEqual(["text", "price"]);
		db.exec(`
insert into product_translations (product_id, locale, name, search_key) values (1, 'en', 'Oil', 'oil');
insert into media_files (r2_key, content_type, byte_size, width, height) values ('${"a".repeat(64)}.jpg', 'image/jpeg', 10, 4, 3);
insert into product_images (product_id, media_file_id, kind) values (1, 1, 'packshot');
insert into product_image_translations (image_id, locale, alt) values (1, 'en', 'A bottle');
`);
		// Text in another language is no text in the default one; the same goes for a photo's.
		expect((await detail()).publishMissing).toEqual([
			"text",
			"price",
			"photo_alt",
		]);
		db.exec(`
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite');
insert into product_image_translations (image_id, locale, alt) values (1, 'es', 'Un frasco');
`);
		readyToPublish();
		expect((await detail()).publishMissing).toEqual([]);
		// A size that is not active does not count as a priced one.
		db.exec("update variants set status = 'archived'");
		expect((await detail()).publishMissing).toEqual(["price"]);
		db.exec("update variants set status = 'active'");
		// An archived photo does not need a description.
		db.exec(
			"delete from product_image_translations where locale = 'es'; update product_images set status = 'archived'",
		);
		expect((await detail()).publishMissing).toEqual([]);
		db.exec("update brands set status = 'archived' where id = 1");
		expect((await detail()).publishMissing).toEqual(["brand"]);
		db.exec("update categories set status = 'archived' where id = 1");
		expect((await detail()).publishMissing).toEqual(["brand", "category"]);
	});

	test("publishing is refused for each missing thing with its own answer, and nothing changes", async () => {
		console.error = () => {};
		const refused = async (error: string) => {
			const res = await send("PATCH", "/1", { status: "published" });
			expect(res.status).toBe(409);
			expect(await errorOf(res)).toBe(error);
			expect(one("select status from products where id = 1").status).toBe(
				"draft",
			);
			expect(audits("product.status")).toBe(0);
		};
		await refused("publish_requires_price");
		readyToPublish();
		db.exec(`
insert into media_files (r2_key, content_type, byte_size, width, height) values ('${"a".repeat(64)}.jpg', 'image/jpeg', 10, 4, 3);
insert into product_images (product_id, media_file_id, kind) values (1, 1, 'packshot');
insert into product_image_translations (image_id, locale, alt) values (1, 'en', 'A bottle');
`);
		await refused("image_alt_required");
		db.exec(
			"insert into product_image_translations (image_id, locale, alt) values (1, 'es', 'Un frasco')",
		);
		db.exec("update brands set status = 'archived' where id = 1");
		await refused("reference_unavailable");
		db.exec("update brands set status = 'active' where id = 1");
		db.exec("update categories set status = 'archived' where id = 1");
		await refused("reference_unavailable");
		db.exec("update categories set status = 'active' where id = 1");
		db.exec("delete from product_translations");
		await refused("publish_requires_default_translation");
		// With the price missing too, the price is what is asked for first.
		db.exec("update variants set price = null");
		await refused("publish_requires_price");
	});

	test("a product that has everything is published, and unpublished again", async () => {
		readyToPublish();
		const published = await send("PATCH", "/1", { status: "published" });
		expect(published.status).toBe(200);
		expect(await published.json()).toMatchObject({
			status: "published",
			publishMissing: [],
		});
		expect(audits("product.status")).toBe(1);
		expect(
			JSON.parse(
				one("select data from audit_events where action = 'product.status'")
					.data as string,
			),
		).toMatchObject({ from: "draft", to: "published" });
		const back = await send("PATCH", "/1", { status: "draft" });
		expect(back.status).toBe(200);
		expect((await back.json()) as Detail).toMatchObject({ status: "draft" });
		expect(audits("product.status")).toBe(2);
	});
});

describe("the sizes of the detail", () => {
	test("say whether the SKU can change and how many units the size holds", async () => {
		db.exec(`
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-30', 1500, 'oil-30');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-50', 2500, 'oil-50');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 2, 100, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 30, 0);
insert into lots (variant_id, receipt_line_id, expires_on, unit_cost_e4) values (2, 1, '2099-12-31', 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 30, 'u');
`);
		const { variants } = await detail();
		// The second size was purchased: its SKU is locked.
		expect(variants.map((v) => [v.sku, v.skuEditable, v.onHand])).toEqual([
			["OIL-30", true, 0],
			["OIL-50", false, 30],
		]);
		db.exec(
			"update variants set price = 1500 where id = 1; update products set status = 'published'",
		);
		// Once the product is not a draft, no SKU is free.
		expect((await detail()).variants.map((v) => v.skuEditable)).toEqual([
			false,
			false,
		]);
	});

	test("a SKU changes only while its product is a draft and the size was never ordered", async () => {
		db.exec(
			"insert into variants (product_id, sku, price, search_key) values (1, 'OIL-30', 1500, 'oil-30')",
		);
		const rename = (sku: string) => send("PATCH", "/variants/1", { sku });
		expect((await rename("OIL-31")).status).toBe(200);
		expect(one("select sku from variants where id = 1").sku).toBe("OIL-31");
		db.exec(`
insert into orders (code, idempotency_key, request_hash, locale, channel, status, subtotal, total, search_key) values ('ECL-1', 'k1', 'h', 'es', 'whatsapp', 'pending', 1500, 1500, 'ecl-1');
insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (1, 1, 1, 1500, 'OIL-31', 'Brand', 'Aceite');
`);
		const locked = await rename("OIL-32");
		expect(locked.status).toBe(409);
		expect(await errorOf(locked)).toBe("sku_locked");
		expect(one("select sku from variants where id = 1").sku).toBe("OIL-31");
	});
});

describe("PUT /products/:id/translations", () => {
	test("writes every language given in one request: the new one, and the one that existed", async () => {
		const res = await send("PUT", "/1/translations", {
			translations: {
				es: { name: "Aceite limpiador", tagline: null, seoTitle: "SEO es" },
				en: { name: "Cleansing oil", description: "A balm" },
			},
		});
		expect(res.status).toBe(200);
		const { translations } = await detail();
		expect(
			translations
				.map((t) => [t.locale, t.name, t.tagline])
				.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
		).toEqual([
			["en", "Cleansing oil", null],
			["es", "Aceite limpiador", null],
		]);
		const stored = db
			.query("select locale, search_key, seo_title from product_translations")
			.all();
		expect(stored).toEqual([
			{ locale: "es", search_key: "aceite limpiador", seo_title: "SEO es" },
			{ locale: "en", search_key: "cleansing oil", seo_title: null },
		]);
		expect(one("select updated_at from products").updated_at).not.toBe(
			"2026-01-01T00:00:00Z",
		);
		expect(audits("product.update")).toBe(1);
	});

	test("never fills in a language that was left out, nor from another one", async () => {
		const res = await send("PUT", "/1/translations", {
			translations: { en: { name: "Oil" } },
		});
		expect(res.status).toBe(200);
		const { translations } = await detail();
		const byLocale = Object.fromEntries(translations.map((t) => [t.locale, t]));
		expect(Object.keys(byLocale).sort()).toEqual(["en", "es"]);
		expect(byLocale.en.name).toBe("Oil");
		// The Spanish text is as it was; only English was written.
		expect(byLocale.es).toMatchObject({ name: "Aceite", tagline: "Frase" });
	});

	test("a field left out stays as it is, and one given as null is cleared", async () => {
		await send("PUT", "/1/translations", {
			translations: { es: { name: "Aceite 2" } },
		});
		expect((await detail()).translations[0]).toMatchObject({
			name: "Aceite 2",
			tagline: "Frase",
		});
		await send("PUT", "/1/translations", {
			translations: { es: { name: "Aceite 2", tagline: null } },
		});
		expect((await detail()).translations[0].tagline).toBeNull();
	});

	test("refuses a language without a name, and writes none of the others", async () => {
		const before = await detail();
		for (const translations of [
			{ es: { name: "Aceite 3" }, en: { tagline: "No name" } },
			{ es: { name: "Aceite 3" }, en: { name: "   " } },
			{},
		]) {
			const res = await send("PUT", "/1/translations", { translations });
			expect(res.status).toBe(400);
			expect(await errorOf(res)).toBe("invalid_request");
		}
		expect((await detail()).translations).toEqual(before.translations);
		expect(audits("product.update")).toBe(0);
	});

	test("answers 404 for a product that does not exist", async () => {
		const res = await send("PUT", "/9/translations", {
			translations: { es: { name: "Nada" } },
		});
		expect(res.status).toBe(404);
	});

	test("is atomic: when one language fails, nothing was written", async () => {
		console.error = () => {};
		db.exec(
			"create trigger fail_english before insert on product_translations when new.locale = 'en' begin select raise(abort, 'boom'); end",
		);
		const res = await send("PUT", "/1/translations", {
			translations: {
				es: { name: "Aceite cambiado" },
				en: { name: "Oil" },
			},
		});
		expect(res.status).toBe(500);
		const { translations } = await detail();
		expect(translations.map((t) => [t.locale, t.name])).toEqual([
			["es", "Aceite"],
		]);
		expect(one("select updated_at from products").updated_at).toBe(
			"2026-01-01T00:00:00Z",
		);
		expect(audits("product.update")).toBe(0);
	});
});

describe("PATCH /products/:id sections", () => {
	test("saves the basics, and the organization with its needs and skin types, as one write", async () => {
		const res = await send("PATCH", "/1", {
			slug: "cleansing-oil",
			inci: "Aqua",
			sanitaryRegistration: " NSO-1 ",
			concernIds: [1, 2],
			skinTypes: ["dry", "oily"],
		});
		expect(res.status).toBe(200);
		expect(await detail()).toMatchObject({
			slug: "cleansing-oil",
			inci: "Aqua",
			concernIds: [1, 2],
			skinTypes: ["dry", "oily"],
		});
		expect(audits("product.update")).toBe(1);
	});

	test("is atomic: when a need cannot be written, the fields and the rest stay as they were", async () => {
		console.error = () => {};
		db.exec(
			"insert into product_concerns (product_id, concern_id) values (1, 1); insert into product_skin_types (product_id, skin_type) values (1, 'dry')",
		);
		db.exec(
			"create trigger fail_dryness before insert on product_concerns when new.concern_id = 2 begin select raise(abort, 'boom'); end",
		);
		const res = await send("PATCH", "/1", {
			inci: "Aqua",
			concernIds: [2],
			skinTypes: ["oily"],
		});
		expect(res.status).toBe(500);
		expect(await detail()).toMatchObject({
			inci: null,
			concernIds: [1],
			skinTypes: ["dry"],
		});
		expect(audits("product.update")).toBe(0);
	});

	test("refuses a brand, a category or a need that is archived, changing nothing", async () => {
		for (const patch of [
			{ brandId: 2 },
			{ categoryId: 2 },
			{ concernIds: [1, 99] },
		]) {
			const res = await send("PATCH", "/1", { ...patch, inci: "Changed" });
			expect(res.status).toBe(409);
			expect(await errorOf(res)).toBe("reference_unavailable");
		}
		expect(await detail()).toMatchObject({ inci: null, brandId: 1 });
	});

	test("the slug changes only while the product is a draft", async () => {
		expect((await send("PATCH", "/1", { slug: "aceite" })).status).toBe(200);
		readyToPublish();
		await send("PATCH", "/1", { status: "published" });
		const res = await send("PATCH", "/1", { slug: "otro" });
		expect(res.status).toBe(409);
		expect(await errorOf(res)).toBe("slug_locked");
		expect(one("select slug from products").slug).toBe("aceite");
	});
});

describe("POST /products with a first size", () => {
	const body = (extra: Record<string, unknown> = {}) => ({
		slug: "serum",
		brandId: 1,
		categoryId: 1,
		concernIds: [1],
		skinTypes: ["dry"],
		translations: { es: { name: "Suero" }, en: { name: "Serum" } },
		...extra,
	});

	test("writes the product, its texts, needs, skin types and size together", async () => {
		const res = await send(
			"POST",
			"",
			body({
				variant: {
					sku: "ser-30",
					price: 1800,
					compareAtPrice: 2200,
					sizeValue: 30,
					sizeUnit: "ml",
					gtin: "4006381333931",
				},
			}),
		);
		expect(res.status).toBe(201);
		const created = (await res.json()) as Detail;
		expect(created).toMatchObject({
			slug: "serum",
			status: "draft",
			concernIds: [1],
			skinTypes: ["dry"],
			publishMissing: [],
		});
		expect(created.translations.map((t) => t.name).sort()).toEqual([
			"Serum",
			"Suero",
		]);
		expect(created.variants).toMatchObject([
			{
				sku: "SER-30",
				price: 1800,
				compareAtPrice: 2200,
				sizeValue: 30,
				sizeUnit: "ml",
				gtin: "04006381333931",
				reorderPoint: null,
				status: "active",
				skuEditable: true,
				onHand: 0,
			},
		]);
		expect(audits("product.create")).toBe(1);
		expect(audits("variant.create")).toBe(1);
	});

	test("without a size it writes the product alone", async () => {
		const res = await send("POST", "", body());
		expect(res.status).toBe(201);
		expect(((await res.json()) as Detail).variants).toEqual([]);
		expect(audits("variant.create")).toBe(0);
	});

	test("a taken SKU or barcode leaves no product, no text and no trace", async () => {
		console.error = () => {};
		console.warn = () => {};
		db.exec(
			"insert into variants (product_id, sku, price, gtin, search_key) values (1, 'SER-30', 1500, '04006381333931', 'ser-30')",
		);
		const products = count("products");
		const translations = count("product_translations");
		for (const [variant, error] of [
			[{ sku: "SER-30" }, "duplicate_sku"],
			[{ sku: "SER-31", gtin: "4006381333931" }, "duplicate_gtin"],
		] as const) {
			const res = await send("POST", "", body({ variant }));
			expect(res.status).toBe(409);
			expect(await errorOf(res)).toBe(error);
		}
		expect(count("products")).toBe(products);
		expect(count("product_translations")).toBe(translations);
		expect(count("product_concerns")).toBe(0);
		expect(count("product_skin_types")).toBe(0);
		expect(audits("product.create")).toBe(0);
	});

	test("refuses a size that breaks the rules, naming the field", async () => {
		for (const [variant, path] of [
			[
				{ sku: "SER-30", price: 1000, compareAtPrice: 900 },
				"variant.compareAtPrice",
			],
			[{ sku: "SER-30", sizeValue: 30 }, "variant.sizeUnit"],
			[{ sku: "SER 30" }, "variant.sku"],
			[{ sku: "SER-30", gtin: "123" }, "variant.gtin"],
		] as const) {
			const res = await send("POST", "", body({ variant }));
			expect(res.status).toBe(400);
			const { issues } = (await res.json()) as { issues: { path: string }[] };
			expect(issues.map((i) => i.path)).toEqual([path]);
		}
		expect(count("products")).toBe(1);
	});

	test("still needs the default language's text", async () => {
		const res = await send(
			"POST",
			"",
			body({ translations: { en: { name: "Serum" } } }),
		);
		expect(res.status).toBe(409);
		expect(await errorOf(res)).toBe("publish_requires_default_translation");
	});
});

describe("POST /products/:id/variants", () => {
	test("adds a size with what is left out as null, and refuses a compare-at price under the price", async () => {
		const ok = await send("POST", "/1/variants", { sku: "oil-30" });
		expect(ok.status).toBe(201);
		expect(await ok.json()).toMatchObject({
			sku: "OIL-30",
			price: null,
			compareAtPrice: null,
			sizeValue: null,
			gtin: null,
		});
		const bad = await send("POST", "/1/variants", {
			sku: "OIL-50",
			price: 500,
			compareAtPrice: 500,
		});
		expect(bad.status).toBe(400);
		expect(
			((await bad.json()) as { issues: { path: string }[] }).issues[0].path,
		).toBe("compareAtPrice");
		expect(count("variants")).toBe(1);
	});
});

describe("the limits the forms let a person type", () => {
	test("each text takes its longest and refuses one more character", async () => {
		const put = (text: Record<string, string>) =>
			send("PUT", "/1/translations", {
				translations: { es: { name: "Aceite", ...text } },
			});
		for (const field of [
			"name",
			"tagline",
			"description",
			"howToUse",
			"keyIngredients",
			"benefits",
			"cautions",
			"seoTitle",
			"seoDescription",
		] as const) {
			const max = PRODUCT_LIMITS[field];
			expect((await put({ [field]: "a".repeat(max) })).status).toBe(200);
			expect((await put({ [field]: "a".repeat(max + 1) })).status).toBe(400);
		}
	});

	test("so do the slug, the registration, the INCI list and the SKU", async () => {
		const patch = (body: Record<string, string>) => send("PATCH", "/1", body);
		for (const field of ["slug", "sanitaryRegistration", "inci"] as const) {
			const max = PRODUCT_LIMITS[field];
			expect((await patch({ [field]: "a".repeat(max) })).status).toBe(200);
			expect((await patch({ [field]: "a".repeat(max + 1) })).status).toBe(400);
		}
		const size = (sku: string) => send("POST", "/1/variants", { sku });
		expect((await size("A".repeat(PRODUCT_LIMITS.sku))).status).toBe(201);
		expect((await size("B".repeat(PRODUCT_LIMITS.sku + 1))).status).toBe(400);
	});
});
