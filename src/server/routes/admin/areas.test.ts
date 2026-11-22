import { describe, expect, test } from "bun:test";
import { searchHitsFor } from "./areas";

const hit = { id: 1, label: "x", hint: null };
const hits = {
	orders: [hit],
	products: [hit],
	customers: [hit],
	suppliers: [hit],
	purchases: [hit],
	brands: [hit],
	categories: [hit],
	bundles: [hit],
	collections: [hit],
	promotions: [hit],
};

describe("searchHitsFor", () => {
	test("an admin sees every group", () => {
		expect(searchHitsFor("admin", hits)).toEqual(hits);
	});

	test("support sees orders, customers and the catalogue, never suppliers, purchases or marketing", () => {
		expect(searchHitsFor("support", hits)).toEqual({
			...hits,
			suppliers: [],
			purchases: [],
			collections: [],
			promotions: [],
		});
	});

	test("without a staff role nothing is shown", () => {
		const shown = searchHitsFor(undefined, hits);
		expect(Object.values(shown).flat()).toEqual([]);
	});

	test("a group without an area is a bug, not a silent result", () => {
		expect(() => searchHitsFor("admin", { reviews: [hit] })).toThrow(
			"Search group reviews has no staff area",
		);
	});
});
