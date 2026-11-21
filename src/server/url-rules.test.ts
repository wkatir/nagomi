import { describe, expect, test } from "bun:test";
import { isRetiredPath, moved, movedTo } from "./url-rules";

describe("URL rules before the app", () => {
	test("only the old real estate pages are retired", () => {
		expect(isRetiredPath("/intelligence")).toBe(true);
		expect(isRetiredPath("/es/white-label/")).toBe(true);
		expect(isRetiredPath("/products")).toBe(false);
		expect(isRetiredPath("/en/research")).toBe(false);
	});
});

describe("addresses that moved to a page of their own", () => {
	const to = (path: string) => movedTo(new URL(path, "https://shop.example"));

	test("the list filtered by only one need, type or brand moves to its page", () => {
		expect(to("/products?concern=pores")).toBe("/needs/pores");
		expect(to("/products?category=serum")).toBe("/categories/serum");
		expect(to("/products?brand=anua")).toBe("/brands/anua");
		expect(to("/en/products?concern=pores")).toBe("/en/needs/pores");
		expect(to("/products/?brand=anua")).toBe("/brands/anua");
	});

	test("anything more than that stays a list", () => {
		expect(to("/products")).toBeNull();
		expect(to("/products?concern=pores&sort=name")).toBeNull();
		expect(to("/products?concern=pores,oily-acne")).toBeNull();
		expect(to("/products?concern=pores&concern=oily-acne")).toBeNull();
		expect(to("/products?skinType=dry")).toBeNull();
		expect(to("/products?q=sun")).toBeNull();
		expect(to("/products?concern=")).toBeNull();
	});

	test("only the product list moves, and only for a slug", () => {
		expect(to("/products/serum?concern=pores")).toBeNull();
		expect(to("/pages/faq?concern=pores")).toBeNull();
		expect(to("/products?concern=Oily%20Acne")).toBeNull();
	});

	test("the answer is a permanent redirect to an absolute address", () => {
		const res = moved("/en/needs/pores", "https://shop.example");
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://shop.example/en/needs/pores",
		);
	});
});
