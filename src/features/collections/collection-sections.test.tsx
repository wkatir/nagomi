import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderWithSettings } from "../merchandising/render-with-settings";
import { CollectionDetails } from "./collection-details";
import { CollectionProducts } from "./collection-products";
import { CollectionTexts } from "./collection-texts";
import type { CollectionDetail } from "./queries";

// How a disabled control is written in the markup (the word also appears in its classes).
const DISABLED = ' disabled=""';

const collection: CollectionDetail = {
	id: 4,
	slug: "essentials",
	status: "draft",
	position: 2,
	showOnHome: true,
	coverMediaId: null,
	createdAt: "2026-10-01T00:00:00Z",
	updatedAt: "2026-10-01T00:00:00Z",
	cover: null,
	translations: [
		{
			collectionId: 4,
			locale: "es",
			title: "Los esenciales",
			description: null,
			coverAlt: "Frascos sobre una mesa",
			seoTitle: null,
			seoDescription: null,
		},
	],
	products: [
		{
			productId: 21,
			position: 1,
			slug: "cleanser",
			status: "published",
			name: "Limpiador suave",
		},
		{
			productId: 22,
			position: 2,
			slug: "teclado-sakura",
			status: "draft",
			name: "Teclado Sakura",
		},
		{
			productId: 23,
			position: 3,
			slug: "toner",
			status: "archived",
			name: null,
		},
	],
};

const input = (out: string, name: string) =>
	out.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0];

describe("CollectionProducts", () => {
	const out = renderWithSettings(
		<CollectionProducts collection={collection} />,
	);

	test("lists the products in order, each with its position, name and slug", () => {
		expect(out.indexOf("Limpiador suave")).toBeLessThan(
			out.indexOf("Teclado Sakura"),
		);
		expect(out.indexOf("Teclado Sakura")).toBeLessThan(out.indexOf("toner"));
		expect(out).toMatch(/<li[^>]*>.*?>1<.*?Limpiador suave/);
		expect(out).toMatch(/<li[^>]*>.*?>3<.*?toner/);
		expect(out).toContain("cleanser");
	});

	test("a product without a name is told by its slug", () => {
		expect(out).toContain(
			`aria-label="${m.admin_merch_remove({ name: "toner" })}"`,
		);
	});

	test("marks the products that are not published, and only those", () => {
		expect(out).toContain(m.admin_merch_status_draft());
		expect(out).toContain(m.admin_merch_status_archived());
		expect(
			out.match(new RegExp(m.admin_merch_status_published(), "g")),
		).toBeNull();
	});

	test("the first cannot move up and the last cannot move down", () => {
		const button = (label: string) =>
			out.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
		expect(
			button(m.admin_merch_move_up({ name: "Limpiador suave" })),
		).toContain(DISABLED);
		expect(
			button(m.admin_merch_move_down({ name: "Limpiador suave" })),
		).not.toContain(DISABLED);
		expect(button(m.admin_merch_move_down({ name: "toner" }))).toContain(
			DISABLED,
		);
		expect(button(m.admin_merch_move_up({ name: "toner" }))).not.toContain(
			DISABLED,
		);
	});

	test("offers to search for a product and starts with save disabled", () => {
		expect(out).toContain(m.admin_merch_find_product());
		expect(out).toMatch(
			new RegExp(
				`<button[^>]*${DISABLED}[^>]*>[^<]*${m.admin_collection_save_products()}`,
			),
		);
	});

	test("with no products it says so", () => {
		const empty = renderWithSettings(
			<CollectionProducts collection={{ ...collection, products: [] }} />,
		);
		expect(empty).toContain(m.admin_collection_products_empty());
		expect(empty).not.toContain("<ol");
	});
});

describe("CollectionDetails", () => {
	test("shows the address, the place, the home mark and a way to choose the cover", () => {
		const out = renderWithSettings(
			<CollectionDetails collection={collection} />,
		);
		expect(input(out, "slug")).toContain('value="essentials"');
		expect(input(out, "slug")).not.toContain(DISABLED);
		expect(input(out, "position")).toContain('value="2"');
		expect(out).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="true"/);
		expect(out).toContain(m.admin_media_choose());
		expect(out).not.toContain(m.admin_media_remove());
	});

	test("a collection with a cover offers to change or remove it", () => {
		const out = renderWithSettings(
			<CollectionDetails collection={{ ...collection, coverMediaId: 9 }} />,
		);
		expect(out).toContain(m.admin_media_change());
		expect(out).toContain(m.admin_media_remove());
	});

	test("a published collection keeps its address, and says why", () => {
		const out = renderWithSettings(
			<CollectionDetails collection={{ ...collection, status: "published" }} />,
		);
		expect(input(out, "slug")).toContain(DISABLED);
		expect(out).toContain(m.admin_collection_slug_locked());
	});
});

describe("CollectionTexts", () => {
	test("shows the texts of the principal language first, with what the cover says", () => {
		const out = renderWithSettings(
			<CollectionTexts
				collection={collection}
				defaultLocale="es"
				onSaved={async () => {}}
			/>,
		);
		expect(input(out, "translations.es.title")).toContain(
			'value="Los esenciales"',
		);
		expect(input(out, "translations.es.coverAlt")).toContain(
			'value="Frascos sobre una mesa"',
		);
		expect(input(out, "translations.en.title")).toBeUndefined();
		expect(out.indexOf(m.language_name_es())).toBeLessThan(
			out.indexOf(m.language_name_en()),
		);
	});
});
