import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { invalidLocales } from "./translations";

const text = z.string().min(1);
const schema = z.object({
	code: z.string().min(1),
	translations: z.object({
		es: z.object({ name: text, description: text }),
		en: z.object({ name: text, description: text }),
	}),
});
const ok = { name: "x", description: "y" };

describe("invalidLocales", () => {
	test("names the languages whose text was refused, in the order of the store's languages", () => {
		const both = schema.safeParse({
			code: "a",
			translations: {
				es: { name: "", description: "y" },
				en: { name: "x", description: "" },
			},
		});
		expect(invalidLocales(both)).toEqual(["es", "en"]);
		const onlyEnglish = schema.safeParse({
			code: "a",
			translations: { es: ok, en: { name: "", description: "y" } },
		});
		expect(invalidLocales(onlyEnglish)).toEqual(["en"]);
	});

	test("says nothing for a form that is valid or refused elsewhere", () => {
		expect(
			invalidLocales(
				schema.safeParse({ code: "a", translations: { es: ok, en: ok } }),
			),
		).toEqual([]);
		expect(
			invalidLocales(
				schema.safeParse({ code: "", translations: { es: ok, en: ok } }),
			),
		).toEqual([]);
	});
});
