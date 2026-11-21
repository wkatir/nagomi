import { describe, expect, test } from "bun:test";
import { phoneDigits, searchKey, searchPatterns } from "./search";

describe("searchKey", () => {
	test("folds case and accents beyond ASCII and collapses spaces", () => {
		expect(searchKey("Crème  Élite")).toBe("creme elite");
		expect(searchKey("ÁNGELA", "Pérez")).toBe("angela perez");
		expect(searchKey("Ñandú", null, undefined, "  ", "ÆØ ß")).toBe(
			"nandu æø ß",
		);
		expect(searchKey("ECL-Q3RTW9", phoneDigits("+503 7123-4567"))).toBe(
			"ecl-q3rtw9 50371234567",
		);
		expect(searchKey()).toBe("");
	});
});

describe("searchPatterns", () => {
	test("normalizes the term like the key and escapes LIKE wildcards", () => {
		expect(searchPatterns("PÉREZ")).toEqual(["%perez%"]);
		expect(searchPatterns("ángela")).toEqual(["%angela%"]);
		expect(searchPatterns("50%_off")).toEqual(["%50\\%\\_off%"]);
		expect(searchPatterns("7123-4567")).toEqual(["%7123-4567%", "%71234567%"]);
		expect(searchPatterns("7123")).toEqual(["%7123%"]);
		expect(searchPatterns("  ")).toEqual([]);
	});
});
