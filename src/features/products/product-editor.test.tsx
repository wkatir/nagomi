import { describe, expect, test } from "bun:test";
import type { AdminProduct } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { render } from "./harness";
import { NewProductForm } from "./new-product-form";
import { ProductEditor } from "./product-editor";

const text = (locale: "es" | "en", name: string) => ({
	productId: 1,
	locale,
	name,
	tagline: null,
	description: null,
	howToUse: null,
	keyIngredients: null,
	benefits: null,
	cautions: null,
	seoTitle: null,
	seoDescription: null,
});

const size = {
	productId: 1,
	status: "active" as const,
	sizeValue: 30,
	sizeUnit: "ml" as const,
	price: 1500,
	compareAtPrice: 2000,
	reorderPoint: 4,
	gtin: "04006381333931",
	createdAt: "2026-01-01T00:00:00Z",
	skuEditable: true,
	onHand: 12,
};

const photo = {
	productId: 1,
	variantId: null,
	mediaFileId: 1,
	kind: "packshot" as const,
	position: 1,
	status: "active" as const,
	createdAt: "2026-01-01T00:00:00Z",
	createdBy: null,
	contentType: "image/jpeg" as const,
	byteSize: 10,
	width: 400,
	height: 300,
};

const alt = (es?: string): Record<string, string> => (es ? { es } : {});

const product: AdminProduct = {
	id: 1,
	slug: "cleansing-oil",
	brandId: 1,
	categoryId: 1,
	status: "draft",
	inci: "Aqua",
	sanitaryRegistration: "NSO-1",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-02-03T15:00:00Z",
	publishMissing: ["photo_alt"],
	translations: [text("es", "Aceite limpiador")],
	variants: [
		{ ...size, id: 1, sku: "OIL-30" },
		{ ...size, id: 2, sku: "OIL-OLD", status: "archived" },
	],
	concernIds: [1],
	skinTypes: ["dry"],
	collectionIds: [],
	images: [
		{
			...photo,
			id: 1,
			r2Key: `${"a".repeat(64)}.jpg`,
			url: `/media/${"a".repeat(64)}.jpg`,
			alt: alt("Un frasco de aceite"),
		},
		{
			...photo,
			id: 2,
			position: 2,
			r2Key: `${"b".repeat(64)}.jpg`,
			url: `/media/${"b".repeat(64)}.jpg`,
			alt: alt(),
		},
	],
};

const buttonWith = (html: string, text: string) => {
	const at = html.indexOf(text);
	if (at < 0) throw new Error(`No button with ${text}`);
	const start = html.lastIndexOf("<button", at);
	return html.slice(start, html.indexOf(">", at) + 1);
};
const editor = (change: Partial<AdminProduct> = {}) =>
	render(<ProductEditor product={{ ...product, ...change }} />);

describe("ProductEditor", () => {
	test("names the product, says where it stands and has a card for each part", () => {
		const html = editor();
		expect(html).toContain("<h1");
		expect(html).toContain("Aceite limpiador");
		expect(html).toContain(m.admin_product_status_draft());
		for (const title of [
			m.admin_product_basics(),
			m.admin_product_texts(),
			m.admin_product_sizes(),
			m.admin_product_photos(),
			m.admin_product_status_title(),
			m.admin_product_organization(),
		])
			expect(html).toContain(title);
		// Each card with a form has its own Save.
		expect(html.match(new RegExp(`>${m.admin_save()}<`, "g"))).toHaveLength(3);
	});

	test("a draft that lacks something cannot be published, and says what", () => {
		const html = editor();
		expect(buttonWith(html, m.admin_product_publish())).toContain(
			'disabled=""',
		);
		expect(html).toContain(
			m.admin_product_req_photo_alt({ language: "Español" }),
		);
		expect(html.match(/data-missing="true"/g)).toHaveLength(1);
		expect(html).not.toContain(m.admin_product_ready());
	});

	test("a draft that has everything can be published", () => {
		const html = editor({ publishMissing: [] });
		expect(buttonWith(html, m.admin_product_publish())).not.toContain(
			'disabled=""',
		);
		expect(html).toContain(m.admin_product_ready());
	});

	test("a published product is taken down, not published again; its slug is locked", () => {
		const html = editor({ status: "published", publishMissing: [] });
		expect(html).toContain(m.admin_product_unpublish());
		expect(html).not.toContain(`>${m.admin_product_publish()}<`);
		expect(html).toContain(m.admin_product_slug_locked());
		// The checklist is for drafts.
		expect(html).not.toContain(m.admin_product_checklist());
	});

	test("an archived product offers neither, and cannot take sizes or photos", () => {
		const html = editor({ status: "archived" });
		expect(html).not.toContain(`>${m.admin_product_publish()}<`);
		expect(html).not.toContain(m.admin_product_unpublish());
		expect(html).not.toContain(m.admin_product_size_add());
		expect(html).not.toContain(m.admin_product_photo_add());
		expect(html).toContain(m.admin_product_note_archived());
	});

	test("a draft's slug can be edited", () => {
		const html = editor();
		expect(html).toContain('value="cleansing-oil"');
		expect(html).not.toContain(m.admin_product_slug_locked());
	});

	test("lists the sizes with their price, stock and a way back for the archived one", () => {
		const html = editor();
		expect(html).toContain("OIL-30");
		expect(html).toContain("30 ml");
		expect(html).toContain("$15.00");
		expect(html).toContain("$20.00");
		expect(html).toContain(m.admin_product_on_hand({ count: 12 }));
		expect(html).toContain(m.admin_product_reorder_at({ count: 4 }));
		expect(html).toContain("04006381333931");
		// The archived size comes last, marked, with Restore instead of Edit.
		expect(html.indexOf("OIL-OLD")).toBeGreaterThan(html.indexOf("OIL-30"));
		expect(html).toContain(m.admin_product_restore());
	});

	test("lists the photos in order, the first being the cover, and flags one without a description", () => {
		const html = editor();
		expect(html).toContain("Un frasco de aceite");
		expect(html).toContain(m.admin_product_photo_cover());
		expect(html).toContain(m.admin_product_photo_no_alt());
		expect(html.match(/<img /g)).toHaveLength(2);
		// The first cannot go up and the last cannot go down.
		const disabled = (label: string) =>
			buttonWith(html, label).includes('disabled=""');
		expect(disabled(m.admin_product_photo_up({ n: 1 }))).toBe(true);
		expect(disabled(m.admin_product_photo_down({ n: 2 }))).toBe(true);
		expect(disabled(m.admin_product_photo_up({ n: 2 }))).toBe(false);
		expect(disabled(m.admin_product_photo_down({ n: 1 }))).toBe(false);
	});

	test("has a tab for each language of the store, the store's first", () => {
		const html = editor();
		expect(html.indexOf("Español")).toBeLessThan(html.indexOf("English"));
	});

	test("organizes the product by brand, category, needs and skin types", () => {
		const html = editor();
		expect(html).toContain("Marca Uno");
		expect(html).toContain("Limpiador");
		expect(html).toContain("Acné");
		expect(html).toContain("Sequedad");
		expect(html).toContain("Seca");
		expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
	});

	test("a brand archived since the product chose it is still named, as archived", () => {
		const html = editor({ brandId: 2 });
		expect(html).toContain(
			m.admin_product_option_archived({ name: "Old brand" }),
		);
	});
});

describe("NewProductForm", () => {
	const html = render(<NewProductForm />);

	test("asks for the basics, the text, the first size and the organization", () => {
		for (const title of [
			m.admin_product_basics(),
			m.admin_product_texts(),
			m.admin_product_first_size(),
			m.admin_product_organization(),
		])
			expect(html).toContain(title);
		expect(html).toContain(m.admin_product_create());
		expect(html).toContain(m.admin_product_sku());
	});

	test("offers the needs and the skin types to choose from, none chosen", () => {
		expect(html).toContain("Acné");
		expect(html).toContain("Sequedad");
		expect(html).toContain("Sensible");
		expect(html.match(/role="checkbox"/g)).toHaveLength(2 + 5);
		expect(html).not.toContain('aria-checked="true"');
	});
});
