import { describe, expect, test } from "bun:test";
import {
	type OrganizationValues,
	organizationPatch,
} from "./organization-form";

const started: OrganizationValues = {
	brandId: "1",
	categoryId: "2",
	concernIds: ["3", "4"],
	skinTypes: ["dry", "oily"],
};

describe("organizationPatch", () => {
	test("is empty when nothing changed, whatever the order of the lists", () => {
		expect(organizationPatch(started, started)).toEqual({});
		expect(
			organizationPatch(
				{ ...started, concernIds: ["4", "3"], skinTypes: ["oily", "dry"] },
				started,
			),
		).toEqual({});
	});

	test("carries only what changed, ids as numbers", () => {
		expect(organizationPatch({ ...started, brandId: "7" }, started)).toEqual({
			brandId: 7,
		});
		expect(organizationPatch({ ...started, categoryId: "8" }, started)).toEqual(
			{ categoryId: 8 },
		);
		expect(
			organizationPatch({ ...started, concernIds: ["3", "5"] }, started),
		).toEqual({ concernIds: [3, 5] });
		expect(
			organizationPatch({ ...started, skinTypes: ["dry"] }, started),
		).toEqual({ skinTypes: ["dry"] });
	});

	test("a set can be emptied", () => {
		expect(
			organizationPatch({ ...started, concernIds: [], skinTypes: [] }, started),
		).toEqual({ concernIds: [], skinTypes: [] });
	});

	test("carries several changes together", () => {
		expect(
			organizationPatch(
				{ ...started, brandId: "9", skinTypes: ["normal"] },
				started,
			),
		).toEqual({ brandId: 9, skinTypes: ["normal"] });
	});
});
