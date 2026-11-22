import { describe, expect, test } from "bun:test";
import { missingToPublish } from "./publishing";

const bundle = (locales: ("es" | "en")[], steps: number) => ({
	translations: locales.map((locale) => ({
		bundleId: 1,
		locale,
		name: "Set",
		description: null,
		seoTitle: null,
		seoDescription: null,
	})),
	items: Array.from({ length: steps }, (_, n) => ({
		bundleId: 1,
		variantId: n + 1,
		quantity: 1,
		position: n + 1,
		sku: `TEC-00${n}`,
		variantStatus: "active" as const,
		price: 1000,
		name: "Name",
	})),
});

describe("missingToPublish", () => {
	test("a bundle with its name and two items lacks nothing", () => {
		expect(missingToPublish(bundle(["es"], 2), "es")).toEqual([]);
	});

	test("one item is not enough", () => {
		expect(missingToPublish(bundle(["es"], 1), "es")).toEqual(["steps"]);
	});

	test("lacks the title when it has none in the principal language, whatever others it has", () => {
		expect(missingToPublish(bundle(["en"], 2), "es")).toEqual(["title"]);
		expect(missingToPublish(bundle(["en"], 2), "en")).toEqual([]);
	});

	test("lacks the steps when it has none", () => {
		expect(missingToPublish(bundle(["es"], 0), "es")).toEqual(["steps"]);
	});

	test("says both, the title first", () => {
		expect(missingToPublish(bundle([], 0), "es")).toEqual(["title", "steps"]);
	});
});
