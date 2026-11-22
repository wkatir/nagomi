import { describe, expect, test } from "bun:test";
import { isStorePath } from "./store-path";

describe("isStorePath", () => {
	test("accepts storefront paths with a query or fragment", () => {
		for (const path of [
			"/",
			"/products",
			"/products?category=teclados",
			"/products?brand=akko&brand=keychron#list",
			"/brands/keychron",
			"/sets",
			"/collections/lo-esencial",
		])
			expect(isStorePath(path)).toBe(true);
	});

	test("refuses links that leave the store", () => {
		for (const path of [
			"https://example.com",
			"//example.com/products",
			"/\\example.com",
			"javascript:alert(1)",
			"products",
			"",
		])
			expect(isStorePath(path)).toBe(false);
	});

	test("refuses spaces, control and non-ASCII characters and long paths", () => {
		expect(isStorePath("/products?q=mouse pad")).toBe(false);
		expect(isStorePath("/productos/ratón")).toBe(false);
		expect(isStorePath("/products\n")).toBe(false);
		expect(isStorePath(`/${"a".repeat(299)}`)).toBe(true);
		expect(isStorePath(`/${"a".repeat(300)}`)).toBe(false);
	});

	test("refuses the API, admin and media paths and locale prefixes", () => {
		for (const path of [
			"/api/store",
			"/admin",
			"/admin/orders",
			"/media/abc.webp",
			"/en/products",
			"/es",
		])
			expect(isStorePath(path)).toBe(false);
		expect(isStorePath("/administration-tips")).toBe(true);
		expect(isStorePath("/english")).toBe(true);
	});
});
