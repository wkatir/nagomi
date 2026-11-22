import { describe, expect, test } from "bun:test";
import { FormApi } from "@tanstack/react-form";
import { z } from "zod";
import { m } from "#/paraglide/messages";
import {
	changedTexts,
	invalidLocales,
	languagesInUse,
	requireInEachLanguage,
	type Translations,
	touchInvalidFields,
} from "./translations";

type Texts = { name: string; seoTitle: string };
const texts = (name = "", seoTitle = ""): Texts => ({ name, seoTitle });
const translations = (es: Texts, en: Texts): Translations<Texts> => ({
	es,
	en,
});

describe("languagesInUse", () => {
	test("the principal language is always there, an untouched other one is not", () => {
		const blank = translations(texts(), texts());
		expect(languagesInUse(blank, [], "es")).toEqual(["es"]);
		expect(languagesInUse(blank, [], "en")).toEqual(["en"]);
	});

	test("a language the entity already has is kept even when its texts were emptied", () => {
		const blank = translations(texts(), texts());
		expect(languagesInUse(blank, ["en"], "es")).toEqual(["es", "en"]);
	});

	test("a language the user wrote in is used, whatever the field", () => {
		expect(
			languagesInUse(translations(texts(), texts("", "A title")), [], "es"),
		).toEqual(["es", "en"]);
		expect(
			languagesInUse(translations(texts(), texts("", "   ")), [], "es"),
		).toEqual(["es"]);
	});
});

describe("requireInEachLanguage", () => {
	const issues = (value: Translations<Texts>, inUse: ("es" | "en")[]) => {
		const result = z
			.custom<Translations<Texts>>()
			.superRefine((v, ctx) => requireInEachLanguage(ctx, v, inUse, "name"))
			.safeParse(value);
		return result.success
			? []
			: result.error.issues.map((i) => [i.path.join("."), i.message]);
	};

	test("asks for the field in each language in use that left it empty", () => {
		const value = translations(texts(), texts("", "Title"));
		expect(issues(value, ["es", "en"])).toEqual([
			["translations.es.name", m.admin_required()],
			["translations.en.name", m.admin_required()],
		]);
	});

	test("does not ask a language that is not in use, nor one that has it", () => {
		expect(issues(translations(texts("Teclado"), texts()), ["es"])).toEqual([]);
		expect(issues(translations(texts(), texts("Keyboard")), ["en"])).toEqual(
			[],
		);
	});
});

describe("changedTexts", () => {
	const initial = translations(texts("Teclado"), texts("Keyboard"));

	test("is the languages in use whose texts are not what the entity had", () => {
		const edited = translations(texts("Teclado"), texts("Keyboard", "SEO"));
		expect(changedTexts(edited, initial, ["es", "en"])).toEqual([
			["en", texts("Keyboard", "SEO")],
		]);
	});

	test("is nothing when nothing changed", () => {
		expect(changedTexts(initial, initial, ["es", "en"])).toEqual([]);
	});

	test("leaves out the languages not in use even when they differ", () => {
		const edited = translations(texts("Teclas"), texts("Keyboard"));
		expect(changedTexts(edited, initial, ["en"])).toEqual([]);
	});

	test("keeps the order of the languages in use", () => {
		const edited = translations(texts("Teclas"), texts("Keyboard 2"));
		expect(changedTexts(edited, initial, ["es", "en"]).map(([l]) => l)).toEqual(
			["es", "en"],
		);
	});
});

describe("invalidLocales", () => {
	const meta = (errors: string[]) => ({ errors });

	test("names the languages that have a field with an error", () => {
		expect(
			invalidLocales({
				slug: meta(["Required"]),
				"translations.es.name": meta([]),
				"translations.en.name": meta(["Required"]),
			}),
		).toEqual(["en"]);
	});

	test("does not take an error of the form's other fields for a language's", () => {
		expect(invalidLocales({ slug: meta(["Required"]) })).toEqual([]);
		expect(invalidLocales({})).toEqual([]);
	});

	test("lists a language once however many fields fail", () => {
		expect(
			invalidLocales({
				"translations.es.name": meta(["a"]),
				"translations.es.seoTitle": meta(["b"]),
				"translations.en.seoTitle": meta(["c"]),
			}),
		).toEqual(["es", "en"]);
	});
});

describe("touchInvalidFields", () => {
	const formWith = (errors: Record<string, string>) => {
		const form = new FormApi({
			defaultValues: {
				slug: "",
				translations: { es: { name: "" }, en: { name: "" } },
			},
		});
		form.mount();
		for (const [name, error] of Object.entries(errors))
			form.setFieldMeta(name as "slug", (previous) => ({
				...previous,
				errorMap: { onDynamic: error },
			}));
		return form;
	};

	test("touches the fields with an error", () => {
		const form = formWith({
			slug: "Required",
			"translations.en.name": "Required",
		});
		expect(form.getFieldMeta("translations.en.name")?.isTouched).toBeFalsy();
		touchInvalidFields(form);
		expect(form.getFieldMeta("slug")?.isTouched).toBe(true);
		expect(form.getFieldMeta("translations.en.name")?.isTouched).toBe(true);
	});

	test("leaves alone the fields without one", () => {
		const form = formWith({ "translations.en.name": "Required" });
		form.setFieldMeta("translations.es.name", (previous) => ({
			...previous,
			errorMap: {},
		}));
		touchInvalidFields(form);
		expect(form.getFieldMeta("translations.es.name")?.isTouched).toBeFalsy();
		expect(form.getFieldMeta("translations.en.name")?.isTouched).toBe(true);
	});
});
