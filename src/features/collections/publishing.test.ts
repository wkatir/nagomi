import { describe, expect, test } from "bun:test";
import { missingToPublish } from "./publishing";

const collection = (locales: ("es" | "en")[], products: number) => ({
	translations: locales.map((locale) => ({
		collectionId: 1,
		locale,
		title: "Title",
		description: null,
		coverAlt: null,
		seoTitle: null,
		seoDescription: null,
	})),
	products: Array.from({ length: products }, (_, n) => ({
		productId: n + 1,
		position: n + 1,
		slug: `p${n}`,
		status: "published" as const,
		name: "Name",
	})),
});

describe("missingToPublish", () => {
	test("a collection with its title and a product lacks nothing", () => {
		expect(missingToPublish(collection(["es"], 1), "es")).toEqual([]);
	});

	test("lacks the title when it has none in the principal language, whatever others it has", () => {
		expect(missingToPublish(collection(["en"], 2), "es")).toEqual(["title"]);
		expect(missingToPublish(collection(["en"], 2), "en")).toEqual([]);
	});

	test("lacks the products when it has none", () => {
		expect(missingToPublish(collection(["es"], 0), "es")).toEqual(["products"]);
	});

	test("says both, the title first", () => {
		expect(missingToPublish(collection([], 0), "es")).toEqual([
			"title",
			"products",
		]);
	});
});
