import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderWithSettings } from "../merchandising/render-with-settings";
import { BundleDetails } from "./bundle-details";
import { BundleItems } from "./bundle-items";
import { BundleTexts } from "./bundle-texts";
import type { BundleDetail } from "./queries";

// How a disabled control is written in the markup (the word also appears in its classes).
const DISABLED = ' disabled=""';

const bundle: BundleDetail = {
	id: 7,
	slug: "set-sakura",
	status: "draft",
	isFeatured: true,
	position: 3,
	price: 11499,
	createdAt: "2026-11-01T00:00:00Z",
	updatedAt: "2026-11-01T00:00:00Z",
	itemsTotal: 9998,
	saving: -1501,
	translations: [
		{
			bundleId: 7,
			locale: "es",
			name: "Set Sakura",
			description: "Teclado y alfombrilla a juego",
			seoTitle: null,
			seoDescription: null,
		},
	],
	items: [
		{
			bundleId: 7,
			variantId: 11,
			quantity: 1,
			position: 1,
			sku: "TEC-002",
			variantStatus: "active",
			price: 7499,
			name: "Teclado Sakura",
		},
		{
			bundleId: 7,
			variantId: 12,
			quantity: 2,
			position: 2,
			sku: "ALF-001",
			variantStatus: "archived",
			price: 1250,
			name: "Alfombrilla Sakura",
		},
	],
};

const input = (out: string, name: string) =>
	out.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0];

describe("BundleItems", () => {
	const out = renderWithSettings(<BundleItems bundle={bundle} />);

	test("lists the items in order, each with its position, name, SKU and quantity", () => {
		expect(out.indexOf("Teclado Sakura")).toBeGreaterThan(-1);
		expect(out.indexOf("Teclado Sakura")).toBeLessThan(
			out.indexOf("Alfombrilla Sakura"),
		);
		expect(out).toContain("TEC-002");
		expect(out).toContain("ALF-001");
		expect(out).toMatch(/<li[^>]*>.*?>1<.*?Teclado Sakura/);
		expect(out).toMatch(/<li[^>]*>.*?>2<.*?Alfombrilla Sakura/);
	});

	test("the buttons of an item say whose they are, and the ends cannot move past themselves", () => {
		const up = (name: string) =>
			out.match(
				new RegExp(
					`<button[^>]*aria-label="${m.admin_merch_move_up({ name })}"[^>]*>`,
				),
			)?.[0];
		const down = (name: string) =>
			out.match(
				new RegExp(
					`<button[^>]*aria-label="${m.admin_merch_move_down({ name })}"[^>]*>`,
				),
			)?.[0];
		expect(up("Teclado Sakura")).toContain(DISABLED);
		expect(down("Teclado Sakura")).not.toContain(DISABLED);
		expect(up("Alfombrilla Sakura")).not.toContain(DISABLED);
		expect(down("Alfombrilla Sakura")).toContain(DISABLED);
		expect(out).toContain(
			`aria-label="${m.admin_merch_remove({ name: "Alfombrilla Sakura" })}"`,
		);
	});

	test("says which variant was archived since it was added", () => {
		expect(
			out.match(new RegExp(m.admin_bundle_size_archived(), "g")),
		).toHaveLength(1);
	});

	test("offers to search for a product, and to save only once something changed", () => {
		expect(out).toContain(m.admin_merch_find_product());
		expect(out).toMatch(
			new RegExp(
				`<button[^>]* disabled=""[^>]*>[^<]*${m.admin_bundle_save_items()}`,
			),
		);
	});

	test("with no items it says so", () => {
		const empty = renderWithSettings(
			<BundleItems bundle={{ ...bundle, items: [] }} />,
		);
		expect(empty).toContain(m.admin_bundle_items_empty());
		expect(empty).not.toContain("<ol");
	});
});

describe("BundleDetails", () => {
	test("shows the price, the sum of its items and the saving", () => {
		const out = renderWithSettings(<BundleDetails bundle={bundle} />);
		expect(out).toContain(m.admin_bundle_price());
		expect(input(out, "price")).toContain('value="114.99"');
		expect(out).toContain("$99.98");
		expect(out).toContain(m.admin_bundle_saving());
	});

	test("shows the address, the place and whether it is featured", () => {
		const out = renderWithSettings(<BundleDetails bundle={bundle} />);
		expect(input(out, "slug")).toContain('value="set-sakura"');
		expect(input(out, "slug")).not.toContain(DISABLED);
		expect(input(out, "position")).toContain('value="3"');
		expect(out).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="true"/);
		expect(out).not.toContain(m.admin_bundle_slug_locked());
	});

	test("a published bundle keeps its address, and says why", () => {
		const out = renderWithSettings(
			<BundleDetails bundle={{ ...bundle, status: "published" }} />,
		);
		expect(input(out, "slug")).toContain(DISABLED);
		expect(out).toContain(m.admin_bundle_slug_locked());
	});
});

describe("BundleTexts", () => {
	test("shows the texts of the principal language first", () => {
		const out = renderWithSettings(
			<BundleTexts
				bundle={bundle}
				defaultLocale="es"
				onSaved={async () => {}}
			/>,
		);
		expect(input(out, "translations.es.name")).toContain('value="Set Sakura"');
		expect(out).toContain("Teclado y alfombrilla a juego");
		expect(input(out, "translations.en.name")).toBeUndefined();
		expect(out.indexOf(m.language_name_es())).toBeLessThan(
			out.indexOf(m.language_name_en()),
		);
	});

	test("starts with save disabled, since nothing changed", () => {
		const out = renderWithSettings(
			<BundleTexts
				bundle={bundle}
				defaultLocale="es"
				onSaved={async () => {}}
			/>,
		);
		expect(out).toMatch(
			new RegExp(`<button[^>]* disabled=""[^>]*>[^<]*${m.admin_save()}`),
		);
	});
});
