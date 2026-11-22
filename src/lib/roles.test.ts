import { describe, expect, test } from "bun:test";
import {
	accessTo,
	canRead,
	canWrite,
	isAdmin,
	isStaff,
	STAFF_AREAS,
} from "./roles";

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

describe("isStaff", () => {
	test("is support or admin, never a customer or a banned account", () => {
		expect(isStaff({ role: "support" })).toBe(true);
		expect(isStaff({ role: "admin" })).toBe(true);
		expect(isStaff({ role: "customer" })).toBe(false);
		expect(isStaff({ role: null })).toBe(false);
		expect(isStaff({ role: "support", banned: true })).toBe(false);
	});
});

describe("accessTo", () => {
	test("an admin may change every area", () => {
		for (const area of STAFF_AREAS)
			expect(accessTo({ role: "admin" }, area)).toBe("write");
	});

	test("support works on orders and customers, reads the catalogue, and sees no money reports, costs or settings", () => {
		expect(accessTo({ role: "support" }, "orders")).toBe("write");
		expect(accessTo({ role: "support" }, "customers")).toBe("write");
		expect(canRead({ role: "support" }, "catalog")).toBe(true);
		expect(canWrite({ role: "support" }, "catalog")).toBe(false);
		for (const area of [
			"dashboard",
			"reports",
			"purchasing",
			"inventory",
			"settings",
			"audit",
			"merchandising",
		] as const)
			expect(accessTo({ role: "support" }, area)).toBe("none");
	});

	test("a customer has no access to the back office", () => {
		for (const area of STAFF_AREAS)
			expect(accessTo({ role: "customer" }, area)).toBe("none");
	});
});
