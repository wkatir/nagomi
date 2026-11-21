import { describe, expect, test } from "bun:test";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
	test("takes the first letter of the first and the last word", () => {
		expect(initialsOf("Wilmer Henrry Salazar Martinez")).toBe("WM");
		expect(initialsOf("Ana Pérez")).toBe("AP");
	});

	test("a single word gives one letter", () => {
		expect(initialsOf("Wilmer")).toBe("W");
	});

	test("ignores extra spaces and keeps accented and astral letters whole", () => {
		expect(initialsOf("  ángela   de la  ñata ")).toBe("ÁÑ");
		expect(initialsOf("𝒜da 𝒷yron")).toBe("𝒜𝒷".toLocaleUpperCase());
	});

	test("refuses a blank name", () => {
		expect(() => initialsOf("   ")).toThrow("A user has a name");
	});
});
