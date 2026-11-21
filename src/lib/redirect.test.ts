import { describe, expect, test } from "bun:test";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
	test("keeps admin paths with search and hash", () => {
		expect(safeRedirect("/admin")).toBe("/admin");
		expect(safeRedirect("/admin/orders?status=pending#top")).toBe(
			"/admin/orders?status=pending#top",
		);
		expect(safeRedirect("/en/admin")).toBe("/en/admin");
		expect(safeRedirect("/en/admin/settings")).toBe("/en/admin/settings");
	});

	test("falls back to the admin home for anything else", () => {
		for (const target of [
			undefined,
			"",
			"admin",
			"https://evil.example",
			"//evil.example",
			"/\\evil.example",
			"/\t/evil.example",
			"/\n/evil.example",
			"/evil.example",
			"/admin-evil",
			"/en/admin-evil",
			"/admin/../evil",
			"/cart",
		])
			expect(safeRedirect(target)).toBe("/admin");
	});
});
