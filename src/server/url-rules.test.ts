import { describe, expect, test } from "bun:test";
import { moved, movedTo } from "./url-rules";

describe("addresses that moved to a page of their own", () => {
	const to = (path: string) => movedTo(new URL(path, "https://shop.example"));

	test("the list filtered by only one category or brand moves to its page", () => {
		expect(to("/products?category=teclados")).toBe("/categories/teclados");
		expect(to("/products?brand=akko")).toBe("/brands/akko");
		expect(to("/en/products?brand=akko")).toBe("/en/brands/akko");
		expect(to("/products/?brand=akko")).toBe("/brands/akko");
	});

	test("anything more than that stays a list", () => {
		expect(to("/products")).toBeNull();
		expect(to("/products?brand=akko&sort=name")).toBeNull();
		expect(to("/products?brand=akko,pulsar")).toBeNull();
		expect(to("/products?brand=akko&brand=pulsar")).toBeNull();
		expect(to("/products?connection=wireless")).toBeNull();
		expect(to("/products?q=mouse")).toBeNull();
		expect(to("/products?brand=")).toBeNull();
	});

	test("only the product list moves, and only for a slug", () => {
		expect(to("/products/rk75?brand=akko")).toBeNull();
		expect(to("/pages/faq?brand=akko")).toBeNull();
		expect(to("/products?brand=Royal%20Kludge")).toBeNull();
	});

	test("the answer is a permanent redirect to an absolute address", () => {
		const res = moved("/en/brands/akko", "https://shop.example");
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://shop.example/en/brands/akko",
		);
	});
});
