import { expect, test } from "bun:test";
import { intlLocale } from "./intl";
import {
	currencySymbol,
	formatMoney,
	minorDigits,
	moneyInput,
	parseMoney,
} from "./money";

test("names the symbol of each currency in the store country's convention", () => {
	expect(currencySymbol("USD", intlLocale("es", "SV"))).toBe("$");
	expect(currencySymbol("USD", intlLocale("en", "SV"))).toBe("$");
	expect(currencySymbol("EUR", intlLocale("es", "ES"))).toBe("€");
	expect(currencySymbol("JPY", "en-US")).toBe("¥");
	expect(currencySymbol("KWD", "en-US")).toBe("KWD");
});

test("formats dollars as $ in both store languages", () => {
	expect(formatMoney(2400, "USD", intlLocale("es", "SV"))).toBe("$24.00");
	expect(formatMoney(2400, "USD", intlLocale("en", "SV"))).toBe("$24.00");
	expect(formatMoney(199_999, "USD", intlLocale("es", "SV"))).toBe("$1,999.99");
});

test("follows the conventions of the store country", () => {
	expect(formatMoney(2400, "EUR", intlLocale("es", "ES"))).toBe("24,00 €");
});

test("uses each currency's minor unit", () => {
	expect(minorDigits("USD")).toBe(2);
	expect(minorDigits("JPY")).toBe(0);
	expect(minorDigits("KWD")).toBe(3);
	expect(formatMoney(2400, "JPY", "en-US")).toBe("¥2,400");
	expect(formatMoney(24_500, "KWD", "en-US")).toBe("KWD\u00a024.500");
	expect(parseMoney("2400", "JPY")).toBe(2400);
	expect(parseMoney("24.5", "JPY")).toBeNull();
	expect(parseMoney("24.5", "KWD")).toBe(24_500);
	expect(moneyInput(24_500, "KWD")).toBe("24.500");
	expect(moneyInput(2400, "JPY")).toBe("2400");
});

test("parses decimal input to cents", () => {
	expect(parseMoney("24", "USD")).toBe(2400);
	expect(parseMoney("24.5", "USD")).toBe(2450);
	expect(parseMoney("19,99", "USD")).toBe(1999);
	expect(parseMoney(" 0.07 ", "USD")).toBe(7);
	expect(parseMoney("0", "USD")).toBe(0);
	expect(parseMoney("5.", "USD")).toBe(500);
	expect(parseMoney("1.10", "USD")).toBe(110);
	expect(moneyInput(2450, "USD")).toBe("24.50");
});

test("rejects anything that is not a plain amount", () => {
	for (const input of [
		"",
		" ",
		"-1",
		"abc",
		"0x10",
		"1e3",
		"1.005",
		".5",
		"1.2.3",
		"1,000.00",
		"Infinity",
		"99999999999999999",
	])
		expect(parseMoney(input, "USD")).toBeNull();
});
