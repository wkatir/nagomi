import { describe, expect, test } from "bun:test";
import { isAdmin } from "./roles";

describe("isAdmin", () => {
	test("is the admin role, alone or among others", () => {
		expect(isAdmin({ role: "admin" })).toBe(true);
		expect(isAdmin({ role: "support,admin" })).toBe(true);
		expect(isAdmin({ role: "admin,support", banned: false })).toBe(true);
	});

	test("is not another role, even one that contains the word", () => {
		for (const role of [
			"user",
			"administrator",
			"superadmin",
			"",
			null,
			undefined,
		])
			expect(isAdmin({ role })).toBe(false);
	});

	test("is not a banned admin", () => {
		expect(isAdmin({ role: "admin", banned: true })).toBe(false);
	});
});
