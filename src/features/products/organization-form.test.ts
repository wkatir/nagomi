import { describe, expect, test } from "bun:test";
import {
	type OrganizationValues,
	organizationPatch,
} from "./organization-form";

const started: OrganizationValues = { brandId: "1", categoryId: "2" };

describe("organizationPatch", () => {
	test("is empty when nothing changed", () => {
		expect(organizationPatch(started, started)).toEqual({});
	});

	test("carries only what changed, ids as numbers", () => {
		expect(organizationPatch({ ...started, brandId: "7" }, started)).toEqual({
			brandId: 7,
		});
		expect(organizationPatch({ ...started, categoryId: "8" }, started)).toEqual(
			{ categoryId: 8 },
		);
	});

	test("carries several changes together", () => {
		expect(
			organizationPatch({ brandId: "9", categoryId: "3" }, started),
		).toEqual({ brandId: 9, categoryId: 3 });
	});
});
