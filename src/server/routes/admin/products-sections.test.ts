import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
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
	warrantyMonths: number;
	isFeatured: boolean;
	badge: string | null;
	brandId: number;
	categoryId: number;
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
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'NAG', 20, 5);
insert into brands (slug, name, search_key) values ('brand', 'Brand', 'brand brand');
insert into brands (slug, name, search_key, status) values ('old-brand', 'Old', 'old old-brand', 'archived');
insert into categories (slug, icon, sort_order) values ('ratones', 'package', 1);
insert into categories (slug, icon, sort_order, status) values ('old-cat', 'package', 2, 'archived');
insert into products (slug, brand_id, category_id, updated_at) values ('raton', 1, 1, '2026-01-01T00:00:00Z');
insert into product_translations (product_id, locale, name, search_key, tagline) values (1, 'es', 'Ratón', 'raton', 'Frase');
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
insert into variants (product_id, sku, price, search_key) values (1, 'RAT-001', 1500, 'rat-001');
`);

describe("what stops a product from being published", () => {
	test("the detail lists it in the order of the checklist, and the list shrinks as it is fixed", async () => {
		// A bare draft: a name in the default language, nothing else.
		expect((await detail()).publishMissing).toEqual(["price"]);
		db.exec("delete from product_translations");
		expect((await detail()).publishMissing).toEqual(["text", "price"]);
		db.exec(`
insert into product_translations (product_id, locale, name, search_key) values (1, 'en', 'Mouse', 'mouse');
insert into media_files (r2_key, content_type, byte_size, width, height) values ('${"a".repeat(64)}.jpg', 'image/jpeg', 10, 4, 3);
insert into product_images (product_id, media_file_id, kind) values (1, 1, 'packshot');
insert into product_image_translations (image_id, locale, alt) values (1, 'en', 'A mouse');
`);
		// Text in another language is no text in the default one; the same goes for a photo's.
		expect((await detail()).publishMissing).toEqual([
			"text",
			"price",
			"photo_alt",
		]);
		db.exec(`
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Ratón', 'raton');
insert into product_image_translations (image_id, locale, alt) values (1, 'es', 'Un ratón');
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
insert into product_image_translations (image_id, locale, alt) values (1, 'en', 'A mouse');
`);
		await refused("image_alt_required");
		db.exec(
			"insert into product_image_translations (image_id, locale, alt) values (1, 'es', 'Un ratón')",
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

describe("the variants of the detail", () => {
	test("say whether the SKU can change and how many units the variant holds", async () => {
		db.exec(`
insert into variants (product_id, sku, price, search_key) values (1, 'RAT-001', 1500, 'rat-001');
insert into variants (product_id, sku, price, search_key) values (1, 'RAT-002', 2500, 'rat-002');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 2, 100, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 30, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (2, 1, 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 30, 'u');
`);
		const { variants } = await detail();
		// The second variant was purchased: its SKU is locked.
		expect(variants.map((v) => [v.sku, v.skuEditable, v.onHand])).toEqual([
			["RAT-001", true, 0],
			["RAT-002", false, 30],
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

	test("a SKU changes only while its product is a draft and the variant was never ordered", async () => {
		db.exec(
			"insert into variants (product_id, sku, price, search_key) values (1, 'RAT-001', 1500, 'rat-001')",
		);
		const rename = (sku: string) => send("PATCH", "/variants/1", { sku });
		expect((await rename("RAT-031")).status).toBe(200);
		expect(one("select sku from variants where id = 1").sku).toBe("RAT-031");
		db.exec(`
insert into orders (code, idempotency_key, request_hash, locale, channel, status, payment_method, shipping_method, confirmation_message, customer_name, customer_email, customer_phone, subtotal, total, search_key) values ('NAG-1', 'k1', 'h', 'es', 'whatsapp', 'pending', 'bank_transfer', 'pickup', 'm', 'Ana', 'ana@example.com', '+50371234567', 1500, 1500, 'nag-1');
insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (1, 1, 1, 1500, 'RAT-031', 'Brand', 'Ratón');
`);
		const locked = await rename("RAT-032");
		expect(locked.status).toBe(409);
		expect(await errorOf(locked)).toBe("sku_locked");
		expect(one("select sku from variants where id = 1").sku).toBe("RAT-031");
	});
});

describe("PUT /products/:id/translations", () => {
	test("writes every language given in one request: the new one, and the one that existed", async () => {
		const res = await send("PUT", "/1/translations", {
			translations: {
				es: { name: "Ratón inalámbrico", tagline: null, seoTitle: "SEO es" },
				en: { name: "Wireless mouse", description: "A light mouse" },
			},
		});
		expect(res.status).toBe(200);
		const { translations } = await detail();
		expect(
			translations
				.map((t) => [t.locale, t.name, t.tagline])
				.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
		).toEqual([
			["en", "Wireless mouse", null],
			["es", "Ratón inalámbrico", null],
		]);
		const stored = db
			.query("select locale, search_key, seo_title from product_translations")
			.all();
		expect(stored).toEqual([
			{ locale: "es", search_key: "raton inalambrico", seo_title: "SEO es" },
			{ locale: "en", search_key: "wireless mouse", seo_title: null },
		]);
		expect(one("select updated_at from products").updated_at).not.toBe(
			"2026-01-01T00:00:00Z",
		);
		expect(audits("product.update")).toBe(1);
	});

	test("never fills in a language that was left out, nor from another one", async () => {
		const res = await send("PUT", "/1/translations", {
			translations: { en: { name: "Mouse" } },
		});
		expect(res.status).toBe(200);
		const { translations } = await detail();
		const byLocale = Object.fromEntries(translations.map((t) => [t.locale, t]));
		expect(Object.keys(byLocale).sort()).toEqual(["en", "es"]);
		expect(byLocale.en.name).toBe("Mouse");
		// The Spanish text is as it was; only English was written.
		expect(byLocale.es).toMatchObject({ name: "Ratón", tagline: "Frase" });
	});

	test("a field left out stays as it is, and one given as null is cleared", async () => {
		await send("PUT", "/1/translations", {
			translations: { es: { name: "Ratón 2" } },
		});
		expect((await detail()).translations[0]).toMatchObject({
			name: "Ratón 2",
			tagline: "Frase",
		});
		await send("PUT", "/1/translations", {
			translations: { es: { name: "Ratón 2", tagline: null } },
		});
		expect((await detail()).translations[0].tagline).toBeNull();
	});

	test("refuses a language without a name, and writes none of the others", async () => {
		const before = await detail();
		for (const translations of [
			{ es: { name: "Ratón 3" }, en: { tagline: "No name" } },
			{ es: { name: "Ratón 3" }, en: { name: "   " } },
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
				es: { name: "Ratón cambiado" },
				en: { name: "Mouse" },
			},
		});
		expect(res.status).toBe(500);
		const { translations } = await detail();
		expect(translations.map((t) => [t.locale, t.name])).toEqual([
			["es", "Ratón"],
		]);
		expect(one("select updated_at from products").updated_at).toBe(
			"2026-01-01T00:00:00Z",
		);
		expect(audits("product.update")).toBe(0);
	});
});

describe("PATCH /products/:id sections", () => {
	test("saves the basics and the organization as one write", async () => {
		const res = await send("PATCH", "/1", {
			slug: "wireless-mouse",
			warrantyMonths: 12,
			isFeatured: true,
			badge: "new",
		});
		expect(res.status).toBe(200);
		expect(await detail()).toMatchObject({
			slug: "wireless-mouse",
			warrantyMonths: 12,
			isFeatured: true,
			badge: "new",
		});
		expect(audits("product.update")).toBe(1);
	});

	test("is atomic: when the write fails, the fields stay as they were", async () => {
		console.error = () => {};
		db.exec(
			"create trigger fail_featured before update of is_featured on products when new.is_featured = 1 begin select raise(abort, 'boom'); end",
		);
		const res = await send("PATCH", "/1", {
			warrantyMonths: 6,
			isFeatured: true,
		});
		expect(res.status).toBe(500);
		expect(await detail()).toMatchObject({
			warrantyMonths: 0,
			isFeatured: false,
		});
		expect(audits("product.update")).toBe(0);
	});

	test("refuses a brand or a category that is archived, changing nothing", async () => {
		for (const patch of [{ brandId: 2 }, { categoryId: 2 }]) {
			const res = await send("PATCH", "/1", { ...patch, warrantyMonths: 3 });
			expect(res.status).toBe(409);
			expect(await errorOf(res)).toBe("reference_unavailable");
		}
		expect(await detail()).toMatchObject({ warrantyMonths: 0, brandId: 1 });
	});

	test("the slug changes only while the product is a draft", async () => {
		expect((await send("PATCH", "/1", { slug: "mouse" })).status).toBe(200);
		readyToPublish();
		await send("PATCH", "/1", { status: "published" });
		const res = await send("PATCH", "/1", { slug: "otro" });
		expect(res.status).toBe(409);
		expect(await errorOf(res)).toBe("slug_locked");
		expect(one("select slug from products").slug).toBe("mouse");
	});
});

describe("POST /products with a first variant", () => {
	const body = (extra: Record<string, unknown> = {}) => ({
		slug: "keyboard",
		brandId: 1,
		categoryId: 1,
		warrantyMonths: 12,
		translations: { es: { name: "Teclado" }, en: { name: "Keyboard" } },
		...extra,
	});

	test("writes the product, its texts and its variant together", async () => {
		const res = await send(
			"POST",
			"",
			body({
				variant: {
					sku: "tec-001",
					price: 1800,
					compareAtPrice: 2200,
					optionLabel: "Negro",
					gtin: "4006381333931",
				},
			}),
		);
		expect(res.status).toBe(201);
		const created = (await res.json()) as Detail;
		expect(created).toMatchObject({
			slug: "keyboard",
			status: "draft",
			warrantyMonths: 12,
			publishMissing: [],
		});
		expect(created.translations.map((t) => t.name).sort()).toEqual([
			"Keyboard",
			"Teclado",
		]);
		expect(created.variants).toMatchObject([
			{
				sku: "TEC-001",
				price: 1800,
				compareAtPrice: 2200,
				optionLabel: "Negro",
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

	test("without a variant it writes the product alone", async () => {
		const res = await send("POST", "", body());
		expect(res.status).toBe(201);
		expect(((await res.json()) as Detail).variants).toEqual([]);
		expect(audits("variant.create")).toBe(0);
	});

	test("a taken SKU or barcode leaves no product, no text and no trace", async () => {
		console.error = () => {};
		console.warn = () => {};
		db.exec(
			"insert into variants (product_id, sku, price, gtin, search_key) values (1, 'TEC-001', 1500, '04006381333931', 'tec-001')",
		);
		const products = count("products");
		const translations = count("product_translations");
		for (const [variant, error] of [
			[{ sku: "TEC-001" }, "duplicate_sku"],
			[{ sku: "TEC-031", gtin: "4006381333931" }, "duplicate_gtin"],
		] as const) {
			const res = await send("POST", "", body({ variant }));
			expect(res.status).toBe(409);
			expect(await errorOf(res)).toBe(error);
		}
		expect(count("products")).toBe(products);
		expect(count("product_translations")).toBe(translations);
		expect(audits("product.create")).toBe(0);
	});

	test("refuses a variant that breaks the rules, naming the field", async () => {
		for (const [variant, path] of [
			[
				{ sku: "TEC-001", price: 1000, compareAtPrice: 900 },
				"variant.compareAtPrice",
			],
			[{ sku: "TEC-001", optionLabel: "a".repeat(61) }, "variant.optionLabel"],
			[{ sku: "TEC 30" }, "variant.sku"],
			[{ sku: "TEC-001", gtin: "123" }, "variant.gtin"],
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
			body({ translations: { en: { name: "Keyboard" } } }),
		);
		expect(res.status).toBe(409);
		expect(await errorOf(res)).toBe("publish_requires_default_translation");
	});
});

describe("POST /products/:id/variants", () => {
	test("adds a variant with what is left out as null, and refuses a compare-at price under the price", async () => {
		const ok = await send("POST", "/1/variants", { sku: "rat-001" });
		expect(ok.status).toBe(201);
		expect(await ok.json()).toMatchObject({
			sku: "RAT-001",
			price: null,
			compareAtPrice: null,
			optionLabel: null,
			gtin: null,
		});
		const bad = await send("POST", "/1/variants", {
			sku: "RAT-002",
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
				translations: { es: { name: "Ratón", ...text } },
			});
		for (const field of [
			"name",
			"tagline",
			"shortSpecs",
			"description",
			"seoTitle",
			"seoDescription",
		] as const) {
			const max = PRODUCT_LIMITS[field];
			expect((await put({ [field]: "a".repeat(max) })).status).toBe(200);
			expect((await put({ [field]: "a".repeat(max + 1) })).status).toBe(400);
		}
	});

	test("so do the slug, the warranty and the SKU", async () => {
		const patch = (body: Record<string, unknown>) => send("PATCH", "/1", body);
		const max = PRODUCT_LIMITS.slug;
		expect((await patch({ slug: "a".repeat(max) })).status).toBe(200);
		expect((await patch({ slug: "a".repeat(max + 1) })).status).toBe(400);
		expect(
			(await patch({ warrantyMonths: PRODUCT_LIMITS.warrantyMonths })).status,
		).toBe(200);
		expect(
			(await patch({ warrantyMonths: PRODUCT_LIMITS.warrantyMonths + 1 }))
				.status,
		).toBe(400);
		const variant = (sku: string) => send("POST", "/1/variants", { sku });
		expect((await variant("AAA-001")).status).toBe(201);
		expect((await variant("AAA-0011")).status).toBe(400);
	});
});
