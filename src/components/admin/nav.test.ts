import { describe, expect, test } from "bun:test";
import { isNavActive, navGroups } from "./nav";

describe("isNavActive", () => {
	test("the overview is current only on its own page", () => {
		expect(isNavActive("/admin", "/admin")).toBe(true);
		expect(isNavActive("/admin", "/admin/orders")).toBe(false);
	});

	test("a section is current on its page and on the pages under it", () => {
		expect(isNavActive("/admin/orders", "/admin/orders")).toBe(true);
		expect(isNavActive("/admin/orders", "/admin/orders/12")).toBe(true);
		expect(isNavActive("/admin/orders", "/admin/orders-archive")).toBe(false);
		expect(isNavActive("/admin/orders", "/admin/products")).toBe(false);
	});
});

test("every section is listed once", () => {
	const targets = navGroups.flatMap((g) => g.items.map((i) => i.to));
	expect(new Set(targets).size).toBe(targets.length);
});
