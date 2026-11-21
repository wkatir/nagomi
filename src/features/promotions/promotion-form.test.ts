import { describe, expect, test } from "bun:test";
import type { Locale } from "#/lib/enums";
import { parseMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import {
	changedTexts,
	type PromotionValues,
	promotionSchema,
	promotionSettings,
	promotionTerms,
} from "./promotion-form";

const amount = (text: string) => parseMoney(text, "USD");
const schema = (
	over: { locked?: boolean; defaultLocale?: Locale; stored?: Locale[] } = {},
) =>
	promotionSchema({
		amount,
		locked: over.locked ?? false,
		defaultLocale: over.defaultLocale ?? "es",
		stored: new Set(over.stored ?? []),
	});

const valid = {
	code: "spring10",
	type: "percentage",
	value: "10",
	minSubtotal: "",
	startsOn: "",
	endsOn: "",
	usageLimit: "",
	perCustomerLimit: "",
	status: "inactive",
	translations: {
		es: { description: "10% de descuento" },
		en: { description: "" },
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

describe("promotionSchema", () => {
	test("accepts a complete form and writes the code in capitals", () => {
		const result = schema().parse({ ...valid, code: "  spring10 " });
		expect(result.code).toBe("SPRING10");
		expect(refusals({})).toEqual([]);
	});

	test("refuses a code that is not 3 to 32 capitals, digits, hyphens or underscores", () => {
		for (const code of ["ab", "con espacio", "x".repeat(33), "ñandú", ""])
			expect(refusals({ code })).toEqual([
				["code", m.admin_promotion_code_format()],
			]);
		expect(refusals({ code: "a_b-9" })).toEqual([]);
	});

	test("a percentage is a whole number from 1 to 100", () => {
		for (const value of ["", "0", "101", "10.5", "-5", "abc", "1e2"])
			expect(refusals({ value })).toEqual([
				["value", m.admin_promotion_percent_range()],
			]);
		for (const value of ["1", "50", "100", " 15 "])
			expect(refusals({ value })).toEqual([]);
	});

	test("a fixed amount is a positive amount of the store currency, up to the largest", () => {
		for (const value of ["", "0", "0.00", "abc", "12.345", "-1", "1000000.01"])
			expect(refusals({ type: "fixed", value })).toEqual([
				["value", m.admin_invalid_amount()],
			]);
		for (const value of ["0.01", "5", "12.50", "1000000.00"])
			expect(refusals({ type: "fixed", value })).toEqual([]);
	});

	test("the minimum order may be left empty, and is a positive amount when given", () => {
		expect(refusals({ minSubtotal: "" })).toEqual([]);
		expect(refusals({ minSubtotal: "20.00" })).toEqual([]);
		for (const minSubtotal of ["0", "abc", "1000000.01"])
			expect(refusals({ minSubtotal })).toEqual([
				["minSubtotal", m.admin_invalid_amount()],
			]);
	});

	test("each limit may be left empty, and is a whole number from 1 to a million when given", () => {
		for (const key of ["usageLimit", "perCustomerLimit"]) {
			for (const value of ["", "1", "1000000"])
				expect(refusals({ [key]: value })).toEqual([]);
			for (const value of ["0", "1.5", "-1", "abc", "1000001"])
				expect(refusals({ [key]: value })).toEqual([
					[key, m.admin_promotion_limit_invalid()],
				]);
		}
	});

	test("the end cannot be before the start; either date may be empty", () => {
		expect(refusals({ startsOn: "2026-06-01", endsOn: "2026-05-31" })).toEqual([
			["endsOn", m.admin_promotion_dates_order()],
		]);
		for (const dates of [
			{ startsOn: "2026-06-01", endsOn: "2026-06-01" },
			{ startsOn: "2026-06-01", endsOn: "" },
			{ startsOn: "", endsOn: "2026-06-01" },
		])
			expect(refusals(dates)).toEqual([]);
		expect(refusals({ startsOn: "2026-02-31" })).toEqual([
			["startsOn", expect.any(String)],
		]);
	});

	test("the description of the default language is required", () => {
		expect(
			refusals({
				translations: { es: { description: " " }, en: { description: "x" } },
			}),
		).toEqual([["translations.es.description", m.admin_required()]]);
		expect(
			refusals(
				{ translations: { es: { description: "x" }, en: { description: "" } } },
				{ defaultLocale: "en" },
			),
		).toEqual([["translations.en.description", m.admin_required()]]);
	});

	test("a language that has a description keeps one, since a description cannot be removed", () => {
		const blank = { es: { description: "x" }, en: { description: "" } };
		expect(refusals({ translations: blank })).toEqual([]);
		expect(refusals({ translations: blank }, { stored: ["en"] })).toEqual([
			["translations.en.description", m.admin_required()],
		]);
	});

	test("a description is at most 200 characters", () => {
		expect(
			refusals({
				translations: {
					es: { description: "x".repeat(201) },
					en: { description: "" },
				},
			}),
		).toEqual([["translations.es.description", expect.any(String)]]);
	});

	test("while the terms are locked their fields are not checked", () => {
		const unlockedBlank = { code: "x", value: "abc", minSubtotal: "-" };
		expect(refusals(unlockedBlank).map(([field]) => field)).toEqual([
			"code",
			"value",
			"minSubtotal",
		]);
		expect(refusals(unlockedBlank, { locked: true })).toEqual([]);
		expect(
			refusals({ ...unlockedBlank, usageLimit: "0" }, { locked: true }),
		).toEqual([["usageLimit", m.admin_promotion_limit_invalid()]]);
	});
});

describe("promotionTerms", () => {
	const parsed = (values: object): PromotionValues =>
		schema().parse({ ...valid, ...values });

	test("a percentage is the number, and the minimum is none or an amount in minor units", () => {
		expect(promotionTerms(parsed({}), amount)).toEqual({
			code: "SPRING10",
			type: "percentage",
			value: 10,
			minSubtotal: null,
		});
		expect(
			promotionTerms(parsed({ minSubtotal: "20.50" }), amount),
		).toMatchObject({ minSubtotal: 2050 });
	});

	test("a fixed amount is in minor units", () => {
		expect(
			promotionTerms(parsed({ type: "fixed", value: "5.25" }), amount),
		).toMatchObject({ type: "fixed", value: 525 });
	});

	test("an amount that is not one is a bug, not a quiet zero", () => {
		const bad = { ...parsed({ type: "fixed" }), value: "abc" };
		expect(() => promotionTerms(bad, amount)).toThrow("Invalid amount abc");
	});
});

describe("promotionSettings", () => {
	test("an empty date or limit is none, the rest is the value", () => {
		expect(
			promotionSettings(schema().parse({ ...valid, status: "active" })),
		).toEqual({
			startsOn: null,
			endsOn: null,
			usageLimit: null,
			perCustomerLimit: null,
			status: "active",
		});
		expect(
			promotionSettings(
				schema().parse({
					...valid,
					startsOn: "2026-03-01",
					endsOn: "2026-03-31",
					usageLimit: "100",
					perCustomerLimit: "2",
				}),
			),
		).toEqual({
			startsOn: "2026-03-01",
			endsOn: "2026-03-31",
			usageLimit: 100,
			perCustomerLimit: 2,
			status: "inactive",
		});
	});
});

describe("changedTexts", () => {
	const both = (es: string, en: string): PromotionValues => ({
		...valid,
		code: "SPRING10",
		translations: { es: { description: es }, en: { description: en } },
	});

	test("a new promotion sends the descriptions that were written", () => {
		expect(changedTexts(both("Hola", ""), new Map())).toEqual({
			es: { description: "Hola" },
		});
		expect(changedTexts(both("Hola", "Hello"), new Map())).toEqual({
			es: { description: "Hola" },
			en: { description: "Hello" },
		});
	});

	test("an edit sends only what differs from what is stored", () => {
		const stored = new Map<Locale, string>([
			["es", "Hola"],
			["en", "Hello"],
		]);
		expect(changedTexts(both("Hola", "Hello"), stored)).toEqual({});
		expect(changedTexts(both("Hola!", "Hello"), stored)).toEqual({
			es: { description: "Hola!" },
		});
		expect(changedTexts(both("Hola", "Hi"), stored)).toEqual({
			en: { description: "Hi" },
		});
	});

	test("a language with nothing written sends nothing", () => {
		expect(changedTexts(both("", ""), new Map())).toEqual({});
	});
});
