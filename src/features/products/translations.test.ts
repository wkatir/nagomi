import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import {
	localesWithErrors,
	productName,
	TEXT_FIELDS,
	type TranslationValues,
	translationsPayload,
	translationsSchema,
	translationValues,
} from "./translations";

const stored = (locale: "es" | "en", name: string, tagline: string | null) => ({
	locale,
	name,
	tagline,
	description: null,
	howToUse: null,
	keyIngredients: null,
	benefits: null,
	cautions: null,
	seoTitle: null,
	seoDescription: "Stored SEO",
});

describe("translationValues", () => {
	test("holds the stored text of each language, and nothing in one that has none", () => {
		const values = translationValues([stored("es", "Aceite", "Frase")]);
		expect(values.es).toEqual({
			name: "Aceite",
			tagline: "Frase",
			description: "",
			howToUse: "",
			keyIngredients: "",
			benefits: "",
			cautions: "",
			seoTitle: "",
			seoDescription: "Stored SEO",
		});
		// The English text is empty, not the Spanish name.
		expect(values.en).toEqual({
			name: "",
			tagline: "",
			description: "",
			howToUse: "",
			keyIngredients: "",
			benefits: "",
			cautions: "",
			seoTitle: "",
			seoDescription: "",
		});
		expect(Object.keys(values.es)).toEqual([...TEXT_FIELDS]);
	});
});

describe("translationsPayload", () => {
	const started = translationValues([stored("es", "Aceite", "Frase")]);
	const edit = (change: (v: TranslationValues) => void) => {
		const values = structuredClone(started);
		change(values);
		return translationsPayload(values, started);
	};

	test("writes nothing when nothing changed", () => {
		expect(translationsPayload(started, started)).toEqual({});
	});

	test("never writes a language nobody typed in, whatever else changed", () => {
		const payload = edit((v) => {
			v.es.name = "Aceite limpiador";
		});
		expect(Object.keys(payload)).toEqual(["es"]);
		expect(payload.en).toBeUndefined();
	});

	test("writes the whole language that changed: trimmed, a blank field as null", () => {
		const payload = edit((v) => {
			v.es.name = "  Aceite limpiador ";
			v.es.tagline = "   ";
			v.es.description = " Un aceite ";
		});
		expect(payload.es).toEqual({
			name: "Aceite limpiador",
			tagline: null,
			description: "Un aceite",
			howToUse: null,
			keyIngredients: null,
			benefits: null,
			cautions: null,
			seoTitle: null,
			seoDescription: "Stored SEO",
		});
	});

	test("adds a language by its name and what was typed with it", () => {
		const payload = edit((v) => {
			v.en.name = "Oil";
			v.en.seoTitle = "Buy oil";
		});
		expect(payload.en).toMatchObject({
			name: "Oil",
			seoTitle: "Buy oil",
			tagline: null,
		});
		expect(payload.es).toBeUndefined();
	});

	test("leaves out a language whose only change is spaces", () => {
		expect(
			edit((v) => {
				v.es.name = "Aceite ";
				v.en.tagline = "  ";
			}),
		).toEqual({});
	});
});

describe("translationsSchema", () => {
	const schema = translationsSchema({ defaultLocale: "es", stored: ["es"] });
	const values = (change: (v: TranslationValues) => void) => {
		const v = translationValues([stored("es", "Aceite", null)]);
		change(v);
		return { translations: v };
	};
	const issues = (value: unknown) =>
		(schema.safeParse(value).error?.issues ?? []).map((i) => [
			i.path.join("."),
			i.message,
		]);

	test("accepts a stored language and a second one left blank", () => {
		expect(schema.safeParse(values(() => {})).success).toBe(true);
	});

	test("asks for the name of the store's language, even if it has no text yet", () => {
		const onlyEnglish = translationsSchema({
			defaultLocale: "es",
			stored: [],
		});
		const empty = translationValues([]);
		expect(
			onlyEnglish.safeParse({ translations: empty }).error?.issues[0]?.path,
		).toEqual(["translations", "es", "name"]);
	});

	test("asks for the name of a stored language that was emptied", () => {
		expect(
			issues(
				values((v) => {
					v.es.name = "  ";
				}),
			),
		).toEqual([["translations.es.name", m.admin_required()]]);
	});

	test("asks for the name of a language where something else was typed", () => {
		expect(
			issues(
				values((v) => {
					v.en.tagline = "A tagline";
				}),
			),
		).toEqual([["translations.en.name", m.admin_required()]]);
		expect(
			schema.safeParse(
				values((v) => {
					v.en.tagline = "A tagline";
					v.en.name = "Oil";
				}),
			).success,
		).toBe(true);
	});

	test("refuses a text over its limit", () => {
		expect(
			schema.safeParse(
				values((v) => {
					v.es.seoTitle = "x".repeat(71);
				}),
			).success,
		).toBe(false);
		expect(
			schema.safeParse(
				values((v) => {
					v.es.seoTitle = "x".repeat(70);
				}),
			).success,
		).toBe(true);
	});
});

describe("productName", () => {
	test("is the name in the language given, or the slug until there is one", () => {
		const product = {
			slug: "oil",
			translations: [{ locale: "en" as const, name: "Oil" }],
		};
		expect(productName(product, "en")).toBe("Oil");
		expect(productName(product, "es")).toBe("oil");
	});
});

describe("localesWithErrors", () => {
	test("names the languages with an error on one of their fields", () => {
		expect(
			localesWithErrors(
				{
					"translations.es.name": { errors: [] },
					"translations.en.tagline": { errors: ["too long"] },
					slug: { errors: ["bad"] },
				},
				"translations",
			),
		).toEqual(["en"]);
		expect(localesWithErrors({}, "translations")).toEqual([]);
		expect(
			localesWithErrors(
				{
					"translations.es.name": { errors: ["x"] },
					"translations.en.name": { errors: ["x"] },
				},
				"translations",
			),
		).toEqual(["es", "en"]);
	});

	test("takes the root of the schema it is asked for, and a field that is the language itself", () => {
		const meta = {
			"alt.es": { errors: ["required"] },
			"translations.en.name": { errors: ["required"] },
		};
		expect(localesWithErrors(meta, "alt")).toEqual(["es"]);
		expect(localesWithErrors(meta, "translations")).toEqual(["en"]);
		// "alt.es" is not a field of the language "e".
		expect(localesWithErrors({ "alt.esx": { errors: ["x"] } }, "alt")).toEqual(
			[],
		);
	});
});
