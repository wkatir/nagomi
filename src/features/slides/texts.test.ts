import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import {
	changedTexts,
	initialTexts,
	localesWithErrors,
	type SlideTexts,
	slideTextsSchema,
} from "./texts";

const empty = { title: "", body: "", ctaLabel: "", imageAlt: "" };
const full = {
	title: "Hola",
	body: "Cuerpo",
	ctaLabel: "Ver",
	imageAlt: "Alt",
};
const texts = (es: Partial<typeof full>, en: Partial<typeof full>) => ({
	translations: { es: { ...empty, ...es }, en: { ...empty, ...en } },
});
const issues = (
	value: ReturnType<typeof texts>,
	options: Parameters<typeof slideTextsSchema>[0],
) => {
	const result = slideTextsSchema(options).safeParse(value);
	return result.success
		? []
		: result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("initialTexts", () => {
	test("fills what the slide has and leaves the rest empty", () => {
		expect(
			initialTexts([
				{
					locale: "en",
					title: "Hi",
					body: null,
					ctaLabel: "Go",
					imageAlt: "Alt",
				},
			]),
		).toEqual({
			es: empty,
			en: { title: "Hi", body: "", ctaLabel: "Go", imageAlt: "Alt" },
		});
	});
});

describe("slideTextsSchema", () => {
	const only = { defaultLocale: "es", stored: [] } as const;

	test("accepts the main language alone", () => {
		expect(issues(texts(full, {}), only)).toEqual([]);
	});

	test("requires a title and an image description in the main language", () => {
		expect(issues(texts({}, {}), only)).toEqual([
			["translations.es.title", m.admin_required()],
			["translations.es.imageAlt", m.admin_required()],
		]);
		expect(issues(texts({ title: "Hola" }, {}), only)).toEqual([
			["translations.es.imageAlt", m.admin_required()],
		]);
	});

	test("takes another language only as a whole", () => {
		expect(issues(texts(full, { body: "Only a body" }), only)).toEqual([
			["translations.en.title", m.admin_required()],
			["translations.en.imageAlt", m.admin_required()],
		]);
		expect(issues(texts(full, { title: "Hi", imageAlt: "Alt" }), only)).toEqual(
			[],
		);
	});

	test("a language the slide already has cannot be emptied", () => {
		expect(
			issues(texts(full, {}), { defaultLocale: "es", stored: ["en"] }),
		).toEqual([
			["translations.en.title", m.admin_required()],
			["translations.en.imageAlt", m.admin_required()],
		]);
	});

	test("the main language is the one the store says", () => {
		expect(
			issues(texts({}, { title: "Hi", imageAlt: "Alt" }), {
				defaultLocale: "en",
				stored: [],
			}),
		).toEqual([]);
	});

	test("trims the text and holds the length the API takes", () => {
		const parsed = slideTextsSchema(only).parse(
			texts({ ...full, title: "  Hola  " }, {}),
		);
		expect(parsed.translations.es.title).toBe("Hola");
		expect(
			issues(texts({ ...full, title: "x".repeat(121) }, {}), only).map(
				([path]) => path,
			),
		).toEqual(["translations.es.title"]);
		expect(
			issues(texts({ ...full, title: "x".repeat(120) }, {}), only),
		).toEqual([]);
	});
});

describe("changedTexts", () => {
	const initial: SlideTexts = {
		es: full,
		en: { title: "Hi", body: "", ctaLabel: "", imageAlt: "Alt" },
	};

	test("is empty when nothing changed", () => {
		expect(changedTexts(initial, initial)).toEqual({});
	});

	test("holds only the languages that differ, with all their fields", () => {
		expect(
			changedTexts(
				{ ...initial, en: { ...initial.en, ctaLabel: "Go" } },
				initial,
			),
		).toEqual({
			en: { title: "Hi", body: "", ctaLabel: "Go", imageAlt: "Alt" },
		});
	});

	test("a language added counts as changed, one cleared as well", () => {
		const added = changedTexts({ es: full, en: full }, { es: full, en: empty });
		expect(Object.keys(added)).toEqual(["en"]);
		const cleared = changedTexts({ es: full, en: empty }, initial);
		expect(Object.keys(cleared)).toEqual(["en"]);
	});
});

describe("localesWithErrors", () => {
	const meta = (errors: unknown[]) => ({ errors });

	test("names the languages with an error on a field", () => {
		expect(
			localesWithErrors({
				"translations.es.title": meta([]),
				"translations.en.imageAlt": meta(["Required"]),
			}),
		).toEqual(["en"]);
	});

	test("lists them in the order of the store's languages", () => {
		expect(
			localesWithErrors({
				"translations.en.title": meta(["x"]),
				"translations.es.title": meta(["x"]),
			}),
		).toEqual(["es", "en"]);
	});

	test("ignores fields of the form that are not texts", () => {
		expect(localesWithErrors({ linkPath: meta(["x"]) })).toEqual([]);
	});
});
