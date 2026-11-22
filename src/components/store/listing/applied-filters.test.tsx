import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListingScope, ListingSearch } from "#/lib/listing";
import type { ProductPage } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { AppliedFilters } from "./applied-filters";

const value = (slug: string, name: string, selected = false) => ({
	slug,
	name,
	count: 1,
	selected,
});

const facets: ProductPage["facets"] = {
	category: [value("teclados", "Teclados"), value("ratones", "Ratones")],
	brand: [value("akko", "Akko")],
	collection: [],
	availability: [],
};

const render = (search: ListingSearch, scope: ListingScope = {}) =>
	renderToStaticMarkup(
		<AppliedFilters
			facets={facets}
			search={search}
			scope={scope}
			onChange={() => {}}
		/>,
	);

describe("AppliedFilters", () => {
	test("draws nothing when no filter is on", () => {
		expect(render({})).toBe("");
		expect(render({ sort: "name", page: 2 })).toBe("");
	});

	test("one chip for each value, named, each with its own removal", () => {
		const html = render({ category: "teclados,ratones", brand: "akko" });
		expect(html).toContain(">Teclados<");
		expect(html).toContain(">Ratones<");
		expect(html).toContain(">Akko<");
		expect(html).toContain(
			`aria-label="${m.shop_remove_filter({ name: "Teclados" })}"`,
		);
		expect(html.match(/<button/g)).toHaveLength(4);
	});

	test("the search and availability are chips too", () => {
		const html = render({ q: "rgb", availability: "in_stock" });
		expect(html).toContain(m.shop_chip_search({ q: "rgb" }));
		expect(html).toContain(m.shop_filter_in_stock());
	});

	test("a value the facets do not list shows its slug", () => {
		expect(render({ category: "unknown-type" })).toContain(">unknown-type<");
	});

	test("clear all appears from the second filter on", () => {
		expect(render({ category: "teclados" })).not.toContain(m.shop_clear_all());
		expect(render({ category: "teclados,ratones" })).toContain(
			m.shop_clear_all(),
		);
		expect(
			render({ category: "teclados", availability: "in_stock" }),
		).toContain(m.shop_clear_all());
	});

	test("a facet the page fixes has no chip", () => {
		const html = render(
			{ category: "teclados", brand: "akko" },
			{ category: "x" },
		);
		expect(html).not.toContain(">Teclados<");
		expect(html).toContain(">Akko<");
	});
});
