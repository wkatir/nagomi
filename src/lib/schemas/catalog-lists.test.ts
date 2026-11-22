import { describe, expect, test } from "bun:test";
import { BRAND_SORTS, brandListSearch } from "./brands";
import { BUNDLE_SORTS, bundleListSearch } from "./bundles";
import { CATEGORY_SORTS, categoryListSearch } from "./categories";
import { COLLECTION_SORTS, collectionListSearch } from "./collections";

const base = { page: 1, pageSize: 25, dir: "asc" } as const;

describe("what an empty search of each list is", () => {
	test("brands by name, categories, bundles and collections in the order the store shows them", () => {
		expect(brandListSearch.parse({})).toEqual({ ...base, sort: "name" });
		expect(categoryListSearch.parse({})).toEqual({
			...base,
			sort: "sortOrder",
		});
		expect(bundleListSearch.parse({})).toEqual({ ...base, sort: "position" });
		expect(collectionListSearch.parse({})).toEqual({
			...base,
			sort: "position",
		});
	});
});

describe.each([
	["brands", brandListSearch, BRAND_SORTS, ["active", "archived"], "draft"],
	[
		"categories",
		categoryListSearch,
		CATEGORY_SORTS,
		["active", "archived"],
		"published",
	],
	[
		"bundles",
		bundleListSearch,
		BUNDLE_SORTS,
		["draft", "published", "archived"],
		"active",
	],
	[
		"collections",
		collectionListSearch,
		COLLECTION_SORTS,
		["draft", "published", "archived"],
		"active",
	],
])("the search of %s", (_name, schema, sorts, statuses, foreignStatus) => {
	test("takes each sort it lists, from a query string or typed", () => {
		for (const sort of sorts) {
			expect(schema.parse({ sort }).sort).toBe(sort);
			expect(schema.parse({ sort, dir: "desc" }).dir).toBe("desc");
		}
	});

	test("takes each status of its entity, and the search text trimmed", () => {
		for (const status of statuses)
			expect(schema.parse({ status, q: "  ab " })).toMatchObject({
				status,
				q: "ab",
			});
	});

	test("refuses a sort that is not listed, a status of another kind of entity and a bad page", () => {
		for (const bad of [
			{ sort: "slug" },
			{ sort: "id" },
			{ status: foreignStatus },
			{ status: "all" },
			{ page: 0 },
			{ pageSize: 30 },
			{ q: "" },
		])
			expect(schema.safeParse(bad).success).toBe(false);
	});
});

test("the sorts are the columns each list can order by", () => {
	expect(BRAND_SORTS).toEqual(["name", "country", "products", "status"]);
	expect(CATEGORY_SORTS).toEqual(["name", "sortOrder", "products", "status"]);
	expect(BUNDLE_SORTS).toEqual([
		"name",
		"position",
		"items",
		"price",
		"featured",
		"status",
	]);
	expect(COLLECTION_SORTS).toEqual([
		"title",
		"position",
		"products",
		"home",
		"status",
	]);
});
