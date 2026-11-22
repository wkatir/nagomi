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
	category: [
		value("teclados", "Teclados", 3),
		value("audifonos", "Audífonos", 0),
	],
	brand: [value("akko", "Akko", 3)],
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
		for (const title of [m.shop_type_label(), m.shop_facet_stock()])
			expect(html).toContain(title);
	});

	test("leaves out a group with a single value to choose", () => {
		expect(render()).not.toContain(m.shop_facet_brand());
	});

	test("keeps a single-valued group once its value is chosen, so it can be undone", () => {
		expect(render({ brand: "akko" })).toContain(m.shop_facet_brand());
	});

	test("leaves out the group a page fixes", () => {
		const html = render({ brand: "akko" }, { category: "teclados" });
		expect(html).not.toContain(m.shop_type_label());
		expect(html).toContain(m.shop_facet_brand());
	});

	test("shows the number of products each value gives", () => {
		const html = render();
		expect(html).toMatch(/<span>Teclados<\/span><span[^>]*>3<\/span>/);
		expect(html).toMatch(/<span>Audífonos<\/span><span[^>]*>0<\/span>/);
	});

	test("a value that gives nothing is disabled unless it is chosen", () => {
		expect(box(render(), "Audífonos")).toContain(DISABLED);
		expect(box(render({ category: "audifonos" }), "Audífonos")).not.toContain(
			DISABLED,
		);
		expect(box(render(), "Teclados")).not.toContain(DISABLED);
	});

	test("the checks follow the search, not the data", () => {
		const html = render({ category: "teclados" });
		expect(box(html, "Teclados")).toContain('aria-checked="true"');
		expect(box(html, "Audífonos")).toContain('aria-checked="false"');
	});

	test("availability is disabled while nothing is in stock, and checked when asked", () => {
		expect(box(render(), m.shop_filter_in_stock())).toContain(DISABLED);
		const on = render({ availability: "in_stock" });
		expect(box(on, m.shop_filter_in_stock())).toContain('aria-checked="true"');
		expect(box(on, m.shop_filter_in_stock())).not.toContain(DISABLED);
	});
});
