import { describe, expect, test } from "bun:test";
import type { Locale } from "#/lib/enums";
import { parseMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import {
	changedTexts,
	type ZoneValues,
	zoneFields,
	zoneSchema,
} from "./zone-form";

const amount = (text: string) => parseMoney(text, "USD");
const schema = (
	over: { creating?: boolean; defaultLocale?: Locale; stored?: Locale[] } = {},
) =>
	zoneSchema({
		amount,
		creating: over.creating ?? true,
		defaultLocale: over.defaultLocale ?? "es",
		stored: new Set(over.stored ?? []),
	});

const valid = {
	slug: "centro",
	method: "own_delivery",
	fee: "3.50",
	freeFrom: "",
	deliveryDaysMin: "1",
	deliveryDaysMax: "2",
	position: "0",
	translations: {
		es: { name: "Centro", description: "" },
		en: { name: "", description: "" },
	},
} as const;

const refusals = (
	values: object,
	over?: Parameters<typeof schema>[0],
): [string, string][] => {
	const result = schema(over).safeParse({ ...valid, ...values });
	return result.success
		? []
		: result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("zoneSchema", () => {
	test("accepts a complete form", () => {
		expect(refusals({})).toEqual([]);
	});

	test("a new zone needs an identifier of lowercase words joined by single hyphens", () => {
		for (const slug of ["", "Centro", "a--b", "-a", "a b", "x".repeat(81)])
			expect(refusals({ slug })).toEqual([
				["slug", m.admin_zone_slug_format()],
			]);
		expect(refusals({ slug: "san-salvador-2" })).toEqual([]);
	});

	test("the identifier of a zone that exists is not on the form", () => {
		expect(refusals({ slug: "" }, { creating: false })).toEqual([]);
	});

	test("the fee is an amount of the store currency, zero included", () => {
		for (const fee of ["", "abc", "-1", "1.234", "1000000.01"])
			expect(refusals({ fee })).toEqual([["fee", m.admin_invalid_amount()]]);
		for (const fee of ["0", "0.00", "3.5", "1000000.00"])
			expect(refusals({ fee })).toEqual([]);
	});

	test("the free-shipping amount may be left empty, and is an amount when given", () => {
		expect(refusals({ freeFrom: "" })).toEqual([]);
		expect(refusals({ freeFrom: "0" })).toEqual([]);
		expect(refusals({ freeFrom: "25.00" })).toEqual([]);
		for (const freeFrom of ["abc", "-5", "1000000.01"])
			expect(refusals({ freeFrom })).toEqual([
				["freeFrom", m.admin_invalid_amount()],
			]);
	});

	test("the days are whole numbers from 0 to 365", () => {
		for (const key of ["deliveryDaysMin", "deliveryDaysMax"]) {
			for (const value of ["", "-1", "1.5", "abc", "366"])
				expect(
					refusals({
						deliveryDaysMin: "0",
						deliveryDaysMax: "365",
						[key]: value,
					}),
				).toEqual([[key, m.admin_zone_days_invalid()]]);
			for (const value of ["0", "365"])
				expect(
					refusals({
						deliveryDaysMin: "0",
						deliveryDaysMax: "365",
						[key]: value,
					}),
				).toEqual([]);
		}
	});

	test("the latest day cannot be before the earliest", () => {
		expect(refusals({ deliveryDaysMin: "3", deliveryDaysMax: "2" })).toEqual([
			["deliveryDaysMax", m.admin_zone_days_order()],
		]);
		expect(refusals({ deliveryDaysMin: "2", deliveryDaysMax: "2" })).toEqual(
			[],
		);
		// A day that is not a number is said once, not also as out of order.
		expect(refusals({ deliveryDaysMin: "abc", deliveryDaysMax: "2" })).toEqual([
			["deliveryDaysMin", m.admin_zone_days_invalid()],
		]);
	});

	test("the position is a whole number from 0 to 1000", () => {
		for (const position of ["", "-1", "1.5", "1001", "abc"])
			expect(refusals({ position })).toEqual([
				["position", m.admin_zone_position_invalid()],
			]);
		for (const position of ["0", "1000"])
			expect(refusals({ position })).toEqual([]);
	});

	test("the name of the default language is required", () => {
		expect(
			refusals({
				translations: {
					es: { name: " ", description: "" },
					en: { name: "Downtown", description: "" },
				},
			}),
		).toEqual([["translations.es.name", m.admin_required()]]);
		expect(
			refusals(
				{
					translations: {
						es: { name: "Centro", description: "" },
						en: { name: "", description: "" },
					},
				},
				{ defaultLocale: "en" },
			),
		).toEqual([["translations.en.name", m.admin_required()]]);
	});

	test("a language that has a name keeps one, and a description needs its name", () => {
		const blankEnglish = {
			es: { name: "Centro", description: "" },
			en: { name: "", description: "" },
		};
		expect(
			refusals({ translations: blankEnglish }, { stored: ["en"] }),
		).toEqual([["translations.en.name", m.admin_required()]]);
		expect(
			refusals({
				translations: {
					es: { name: "Centro", description: "" },
					en: { name: "", description: "Near the park" },
				},
			}),
		).toEqual([["translations.en.name", m.admin_required()]]);
	});

	test("a name is at most 80 characters and a description 300", () => {
		expect(
			refusals({
				translations: {
					es: { name: "x".repeat(81), description: "y".repeat(301) },
					en: { name: "", description: "" },
				},
			}).map(([field]) => field),
		).toEqual(["translations.es.name", "translations.es.description"]);
	});
});

describe("zoneFields", () => {
	const parsed = (values: object): ZoneValues =>
		schema().parse({ ...valid, ...values });

	test("turns the text into minor units and numbers", () => {
		expect(
			zoneFields(
				parsed({
					fee: "3.50",
					freeFrom: "25",
					deliveryDaysMin: "2",
					deliveryDaysMax: "4",
					position: "7",
				}),
				amount,
			),
		).toEqual({
			method: "own_delivery",
			fee: 350,
			freeFrom: 2500,
			deliveryDaysMin: 2,
			deliveryDaysMax: 4,
			position: 7,
		});
	});

	test("an empty free-shipping amount is none, and a free zone is zero", () => {
		expect(zoneFields(parsed({ fee: "0" }), amount)).toMatchObject({
			fee: 0,
			freeFrom: null,
		});
		expect(zoneFields(parsed({ freeFrom: "0" }), amount)).toMatchObject({
			freeFrom: 0,
		});
	});

	test("an amount that is not one is a bug, not a quiet zero", () => {
		const bad = { ...parsed({}), fee: "abc" };
		expect(() => zoneFields(bad, amount)).toThrow("Invalid amount abc");
	});
});

describe("changedTexts", () => {
	const both = (es: [string, string], en: [string, string]): ZoneValues => ({
		...valid,
		translations: {
			es: { name: es[0], description: es[1] },
			en: { name: en[0], description: en[1] },
		},
	});

	test("a new zone sends the languages that were written", () => {
		expect(changedTexts(both(["Centro", ""], ["", ""]), new Map())).toEqual({
			es: { name: "Centro", description: "" },
		});
		expect(
			changedTexts(both(["Centro", "x"], ["Downtown", ""]), new Map()),
		).toEqual({
			es: { name: "Centro", description: "x" },
			en: { name: "Downtown", description: "" },
		});
	});

	test("an edit sends only the languages whose name or description changed", () => {
		const stored = new Map<
			Locale,
			{ name: string; description: string | null }
		>([
			["es", { name: "Centro", description: null }],
			["en", { name: "Downtown", description: "Near the park" }],
		]);
		expect(
			changedTexts(both(["Centro", ""], ["Downtown", "Near the park"]), stored),
		).toEqual({});
		expect(
			changedTexts(
				both(["Centro 2", ""], ["Downtown", "Near the park"]),
				stored,
			),
		).toEqual({ es: { name: "Centro 2", description: "" } });
		expect(
			changedTexts(
				both(["Centro", ""], ["Downtown", "Near the plaza"]),
				stored,
			),
		).toEqual({ en: { name: "Downtown", description: "Near the plaza" } });
		// Clearing a description is a change.
		expect(
			changedTexts(both(["Centro", ""], ["Downtown", ""]), stored),
		).toEqual({ en: { name: "Downtown", description: "" } });
	});
});
