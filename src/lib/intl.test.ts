import { expect, test } from "bun:test";
import {
	canonicalTimeZone,
	intlLocale,
	isCountryCode,
	isCurrencyCode,
} from "./intl";

test("builds the Intl locale from language and country", () => {
	expect(intlLocale("es", "SV")).toBe("es-SV");
});

test("accepts IANA zones and rejects offsets and unknown names", () => {
	expect(canonicalTimeZone("America/El_Salvador")).toBe("America/El_Salvador");
	expect(canonicalTimeZone("UTC")).toBe("UTC");
	expect(canonicalTimeZone("america/el_salvador")).toBe("America/El_Salvador");
	expect(canonicalTimeZone("-06:00")).toBeNull();
	expect(canonicalTimeZone("Mars/Olympus_Mons")).toBeNull();
	expect(canonicalTimeZone("")).toBeNull();
});

test("validates country and currency codes", () => {
	expect(isCountryCode("SV")).toBe(true);
	expect(isCountryCode("sv")).toBe(false);
	expect(isCountryCode("ZZ")).toBe(false);
	expect(isCountryCode("QQ")).toBe(false);
	expect(isCurrencyCode("USD")).toBe(true);
	expect(isCurrencyCode("XYZ")).toBe(false);
});
