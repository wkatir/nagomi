import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { altPatch, altSchema, altValues, moved } from "./photo-form";

describe("altValues", () => {
	test("holds the stored description of each language, blank where there is none", () => {
		expect(altValues({ es: "Un frasco" })).toEqual({ es: "Un frasco", en: "" });
		expect(altValues({})).toEqual({ es: "", en: "" });
	});
});

describe("altSchema", () => {
	test("needs the description in the store's language, and only there", () => {
		const schema = altSchema("es");
		expect(schema.safeParse({ alt: { es: "Un frasco", en: "" } }).success).toBe(
			true,
		);
		const result = schema.safeParse({ alt: { es: " ", en: "A bottle" } });
		expect(result.success).toBe(false);
		expect(
			result.error?.issues.map((i) => [i.path.join("."), i.message]),
		).toEqual([["alt.es", m.admin_required()]]);
		expect(
			altSchema("en").safeParse({ alt: { es: "Un frasco", en: "" } }).success,
		).toBe(false);
	});

	test("refuses a description over its limit", () => {
		const schema = altSchema("es");
		expect(
			schema.safeParse({ alt: { es: "x".repeat(250), en: "" } }).success,
		).toBe(true);
		expect(
			schema.safeParse({ alt: { es: "x".repeat(251), en: "" } }).success,
		).toBe(false);
	});
});

describe("altPatch", () => {
	const started = { es: "Un frasco", en: "" };

	test("is empty when nothing changed, even by spaces", () => {
		expect(altPatch(started, started)).toEqual({});
		expect(altPatch(started, { es: " Un frasco ", en: "  " })).toEqual({});
	});

	test("carries the text of a language that changed or was added", () => {
		expect(altPatch(started, { es: "Un frasco de aceite", en: "" })).toEqual({
			es: "Un frasco de aceite",
		});
		expect(altPatch(started, { es: "Un frasco", en: " A bottle " })).toEqual({
			en: "A bottle",
		});
	});

	test("removes a language that was emptied", () => {
		expect(
			altPatch(
				{ es: "Un frasco", en: "A bottle" },
				{ es: "Un frasco", en: "" },
			),
		).toEqual({ en: null });
	});
});

describe("moved", () => {
	test("moves a photo one place up or down", () => {
		expect(moved([10, 20, 30], 1, -1)).toEqual([20, 10, 30]);
		expect(moved([10, 20, 30], 1, 1)).toEqual([10, 30, 20]);
		expect(moved([10, 20, 30], 0, 1)).toEqual([20, 10, 30]);
		expect(moved([10, 20, 30], 2, -1)).toEqual([10, 30, 20]);
	});

	test("cannot move the first up or the last down", () => {
		expect(moved([10, 20, 30], 0, -1)).toBeNull();
		expect(moved([10, 20, 30], 2, 1)).toBeNull();
		expect(moved([10], 0, 1)).toBeNull();
	});

	test("does not change the list it was given", () => {
		const ids = [1, 2, 3];
		moved(ids, 0, 1);
		expect(ids).toEqual([1, 2, 3]);
	});
});
