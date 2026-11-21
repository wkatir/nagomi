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
	category: [value("serum", "Sérum")],
	concern: [value("pores", "Poros"), value("sensitive", "Piel sensible")],
	skinType: [value("oily", "oily")],
	brand: [value("anua", "Anua")],
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
		const html = render({ concern: "pores,sensitive", brand: "anua" });
		expect(html).toContain(">Poros<");
		expect(html).toContain(">Piel sensible<");
		expect(html).toContain(">Anua<");
		expect(html).toContain(
			`aria-label="${m.shop_remove_filter({ name: "Poros" })}"`,
		);
		expect(html.match(/<button/g)).toHaveLength(4);
	});

	test("the search and availability are chips too", () => {
		const html = render({ q: "sun", availability: "in_stock" });
		expect(html).toContain(m.shop_chip_search({ q: "sun" }));
		expect(html).toContain(m.shop_filter_in_stock());
	});

	test("skin types are named in the customer's language", () => {
		const html = render({ skinType: "oily" });
		expect(html).toContain(`>${m.skin_type_oily()}<`);
		expect(html).not.toContain(">oily<");
	});

	test("a value the facets do not list shows its slug", () => {
		expect(render({ concern: "unknown-need" })).toContain(">unknown-need<");
	});

	test("clear all appears from the second filter on", () => {
		expect(render({ concern: "pores" })).not.toContain(m.shop_clear_all());
		expect(render({ concern: "pores,sensitive" })).toContain(
			m.shop_clear_all(),
		);
		expect(render({ concern: "pores", availability: "in_stock" })).toContain(
			m.shop_clear_all(),
		);
	});

	test("a facet the page fixes has no chip", () => {
		const html = render({ concern: "pores", brand: "anua" }, { concern: "x" });
		expect(html).not.toContain(">Poros<");
		expect(html).toContain(">Anua<");
	});
});
