import { describe, expect, test } from "bun:test";
import { missingToPublish } from "./publishing";

const routine = (locales: ("es" | "en")[], steps: number) => ({
	translations: locales.map((locale) => ({
		routineId: 1,
		locale,
		title: "Title",
		description: null,
		seoTitle: null,
		seoDescription: null,
	})),
	items: Array.from({ length: steps }, (_, n) => ({
		routineId: 1,
		variantId: n + 1,
		position: n + 1,
		sku: `SKU${n}`,
		variantStatus: "active" as const,
		name: "Name",
	})),
});

describe("missingToPublish", () => {
	test("a routine with its title and a step lacks nothing", () => {
		expect(missingToPublish(routine(["es"], 1), "es")).toEqual([]);
	});

	test("lacks the title when it has none in the principal language, whatever others it has", () => {
		expect(missingToPublish(routine(["en"], 2), "es")).toEqual(["title"]);
		expect(missingToPublish(routine(["en"], 2), "en")).toEqual([]);
	});

	test("lacks the steps when it has none", () => {
		expect(missingToPublish(routine(["es"], 0), "es")).toEqual(["steps"]);
	});

	test("says both, the title first", () => {
		expect(missingToPublish(routine([], 0), "es")).toEqual(["title", "steps"]);
	});
});
