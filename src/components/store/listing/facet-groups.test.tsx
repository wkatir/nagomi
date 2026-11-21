import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListingScope, ListingSearch } from "#/lib/listing";
import type { ProductPage } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { FacetGroups } from "./facet-groups";

const value = (
	slug: string,
	name: string,
	count: number,
	selected = false,
) => ({
	slug,
	name,
	count,
	selected,
});

const facets: ProductPage["facets"] = {
	category: [value("serum", "Sérum", 3), value("mask", "Mascarilla", 0)],
	concern: [value("pores", "Poros", 2), value("sensitive", "Piel sensible", 1)],
	skinType: [value("dry", "dry", 1), value("oily", "oily", 2)],
	brand: [value("anua", "Anua", 3)],
	collection: [],
	availability: [
		{ value: "in_stock", count: 0, selected: false },
		{ value: "sold_out", count: 3, selected: false },
	],
};

const render = (
	search: ListingSearch = {},
	scope: ListingScope = {},
	withFacets = facets,
) =>
	renderToStaticMarkup(
		<FacetGroups
			facets={withFacets}
			search={search}
			scope={scope}
			onChange={() => {}}
		/>,
	);

// How a disabled control is written in the markup (the word also appears in its classes).
const DISABLED = ' disabled=""';

const box = (html: string, label: string) =>
	html.match(
		new RegExp(
			`<button[^>]*role="checkbox"[^>]*>(?:(?!</li>).)*?<span>${label}</span>`,
			"s",
		),
	)?.[0];

describe("FacetGroups", () => {
	test("has a group for each facet with something to choose, and availability", () => {
		const html = render();
		for (const title of [
			m.shop_facet_need(),
			m.shop_type_label(),
			m.shop_facet_skin(),
			m.shop_facet_stock(),
		])
			expect(html).toContain(title);
	});

	test("leaves out a group with a single value to choose", () => {
		expect(render()).not.toContain(m.shop_facet_brand());
	});

	test("keeps a single-valued group once its value is chosen, so it can be undone", () => {
		expect(render({ brand: "anua" })).toContain(m.shop_facet_brand());
	});

	test("leaves out the group a page fixes", () => {
		const html = render({}, { concern: "pores" });
		expect(html).not.toContain(m.shop_facet_need());
		expect(html).toContain(m.shop_type_label());
	});

	test("shows the number of products each value gives", () => {
		const html = render();
		expect(html).toMatch(/<span>Poros<\/span><span[^>]*>2<\/span>/);
		expect(html).toMatch(/<span>Sérum<\/span><span[^>]*>3<\/span>/);
	});

	test("a value that gives nothing is disabled unless it is chosen", () => {
		expect(box(render(), "Mascarilla")).toContain(DISABLED);
		expect(box(render({ category: "mask" }), "Mascarilla")).not.toContain(
			DISABLED,
		);
		expect(box(render(), "Sérum")).not.toContain(DISABLED);
	});

	test("the checks follow the search, not the data", () => {
		const html = render({ concern: "sensitive,pores", category: "serum" });
		expect(box(html, "Poros")).toContain('aria-checked="true"');
		expect(box(html, "Piel sensible")).toContain('aria-checked="true"');
		expect(box(html, "Sérum")).toContain('aria-checked="true"');
		expect(box(html, "Mascarilla")).toContain('aria-checked="false"');
	});

	test("skin types are named in the customer's language", () => {
		const html = render();
		expect(html).toContain(`<span>${m.skin_type_dry()}</span>`);
		expect(html).toContain(`<span>${m.skin_type_oily()}</span>`);
		expect(html).not.toContain("<span>dry</span>");
	});

	test("availability is disabled while nothing is in stock, and checked when asked", () => {
		expect(box(render(), m.shop_filter_in_stock())).toContain(DISABLED);
		const on = render({ availability: "in_stock" });
		expect(box(on, m.shop_filter_in_stock())).toContain('aria-checked="true"');
		expect(box(on, m.shop_filter_in_stock())).not.toContain(DISABLED);
	});
});
